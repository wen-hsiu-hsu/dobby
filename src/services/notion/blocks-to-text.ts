import type { BlockObjectResponse } from '@notionhq/client/build/src/api-endpoints.js';

/**
 * A Notion block plus its already-fetched children (see
 * announcement-repository.ts's getBlocks, which recurses into `has_children`
 * blocks) — Notion's own API only returns one level of children per call.
 */
export type NestedBlock = BlockObjectResponse & { children?: NestedBlock[] };

// Matches the hand-typed `—` separator the templates already use between
// sections, so a Notion `---` divider block renders the same way. Not the
// 8-dash `————————` that season-announcement.ts splits messages on — a
// divider block never splits the NEW_SEASON template.
const DIVIDER_LINE = '—';

// Notion's own nested numbered-list look: 1. → a. → i. → back to 1., by how
// many numbered_list_item ancestors the list has.
const DEPTH_LIST_FORMATS = ['numbers', 'letters', 'roman'] as const;
type ListFormat = (typeof DEPTH_LIST_FORMATS)[number];

function toLetters(n: number): string {
  let out = '';
  for (let k = n; k > 0; k = Math.floor((k - 1) / 26)) {
    out = String.fromCharCode(97 + ((k - 1) % 26)) + out;
  }
  return out;
}

function toRoman(n: number): string {
  const numerals: [number, string][] = [
    [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'],
    [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i'],
  ];
  let out = '';
  let rest = n;
  for (const [value, numeral] of numerals) {
    while (rest >= value) {
      out += numeral;
      rest -= value;
    }
  }
  return out;
}

function formatListNumber(n: number, format: ListFormat): string {
  if (format === 'letters') return toLetters(n);
  if (format === 'roman') return toRoman(n);
  return String(n);
}

function blockText(block: NestedBlock): string {
  const content = (block as any)[block.type];
  const richText: any[] = content?.rich_text ?? [];
  return richText.map((r: any) => r.plain_text ?? '').join('');
}

function blockLine(block: NestedBlock, depth: number, listMarker: string | null): string | null {
  const type = block.type as string;
  const indent = '  '.repeat(depth);
  if (type === 'divider') return `${indent}${DIVIDER_LINE}`;
  const content = (block as any)[type];
  if (!content) return null;
  const text = blockText(block);
  if (!text) {
    // An empty paragraph is a blank line the admin typed in Notion — keep it.
    // Other empty blocks (an empty toggle's own line, images, …) have nothing to show.
    return type === 'paragraph' ? '' : null;
  }
  if (type === 'bulleted_list_item') return `${indent}• ${text}`;
  if (type === 'numbered_list_item') return `${indent}${listMarker}. ${text}`;
  if (type === 'to_do') return `${indent}${content.checked ? '☑' : '☐'} ${text}`;
  return `${indent}${text}`;
}

// `depth` drives indentation (every nested block counts: toggles, columns, …);
// `listDepth` counts only numbered_list_item ancestors and picks the 1./a./i.
// format — a numbered list inside a toggle or column still starts at "1.".
function flattenLines(blocks: NestedBlock[], depth: number, listDepth: number): string[] {
  const lines: string[] = [];
  const defaultFormat = DEPTH_LIST_FORMATS[listDepth % DEPTH_LIST_FORMATS.length]!;
  // A numbered list is a run of consecutive numbered_list_item siblings — any
  // other block in between restarts it at 1, same as in Notion. Empty items are
  // skipped without taking a number, so the printed numbering has no gaps.
  let inRun = false;
  let listNumber = 0;
  let listFormat: ListFormat = defaultFormat;
  for (const block of blocks) {
    let listMarker: string | null = null;
    const isNumbered = block.type === 'numbered_list_item';
    if (!isNumbered) {
      inRun = false;
    } else {
      if (!inRun) {
        // Newer Notion API versions put these on a list's first item only (read
        // even when that item is empty); the 2022-06-28 version notion-fetch.ts
        // pins doesn't send them.
        const content = (block as any).numbered_list_item;
        inRun = true;
        listNumber = Math.max(content.list_start_index ?? 1, 1) - 1;
        listFormat = content.list_format ?? defaultFormat;
      }
      if (blockText(block)) {
        listNumber++;
        listMarker = formatListNumber(listNumber, listFormat);
      }
    }
    const line = blockLine(block, depth, listMarker);
    if (line !== null) lines.push(line);
    if (block.children && block.children.length > 0) {
      lines.push(...flattenLines(block.children, depth + 1, isNumbered ? listDepth + 1 : listDepth));
    }
  }
  return lines;
}

/**
 * Flattens Notion block children into plain text, one block per line.
 * `bulleted_list_item` blocks get a "• " prefix, `numbered_list_item` blocks get
 * "1. " (lists nested inside a numbered item get "a. ", then "i. "), `to_do` blocks get "☐ "/"☑ ",
 * `divider` blocks become "—", and empty paragraphs become blank lines — every
 * other block type is used as-is.
 * Blank lines at the very start/end are dropped (e.g. PAYMENT's trailing empty
 * paragraph), but a first line's indentation is kept.
 * Nested blocks (toggle contents, sub-lists) are indented two spaces per depth level
 * and appear right after their parent's own line.
 */
export function blocksToText(blocks: NestedBlock[]): string {
  const lines = flattenLines(blocks, 0, 0);
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start] === '') start++;
  while (end > start && lines[end - 1] === '') end--;
  return lines.slice(start, end).join('\n');
}

export interface TextSection {
  /** The heading block's text; '' for content before the first heading or right after a divider. */
  heading: string;
  /** The section's blocks run through blocksToText — '' when the heading has nothing under it. */
  body: string;
}

const HEADING_TYPES = new Set(['heading_1', 'heading_2', 'heading_3']);

/**
 * Splits top-level blocks into sections for the announcement Flex card: every
 * heading_1/2/3 starts a new section (its text becomes the section heading),
 * and a top-level divider ends the current one — the card draws its own line
 * between sections, so the divider itself isn't output. Each section's body
 * uses the same conversion as blocksToText. A toggleable heading's children
 * start that section's body (not indented), converted on their own so a
 * numbered list inside the heading and one right after it each start at 1,
 * same as blocksToText's output. Sections with neither a heading
 * nor a body (a divider right before a heading, two dividers in a row) are
 * dropped. Headings nested inside toggles/columns don't split — they stay as
 * plain lines in their section's body.
 */
export function blocksToSections(blocks: NestedBlock[]): TextSection[] {
  const sections: TextSection[] = [];
  let heading = '';
  let headingChildren: NestedBlock[] = [];
  let run: NestedBlock[] = [];
  const flush = () => {
    const body = [blocksToText(headingChildren), blocksToText(run)].filter(Boolean).join('\n');
    if (heading || body) sections.push({ heading, body });
    heading = '';
    headingChildren = [];
    run = [];
  };
  for (const block of blocks) {
    if (block.type === 'divider') {
      flush();
    } else if (HEADING_TYPES.has(block.type)) {
      flush();
      heading = blockText(block);
      headingChildren = block.children ?? [];
    } else {
      run.push(block);
    }
  }
  flush();
  return sections;
}

/**
 * Reads a table that has its header row turned on as one record per data row,
 * keyed by the header cell's text (so callers look columns up by name, not by
 * position — admins can reorder or add columns in Notion). Cell text is
 * trimmed; a column missing from a row reads as ''. Returns null when the
 * block isn't a table, the table's header row is off (the column names are what
 * give the cells their meaning) or it has no rows at all; a table with only its
 * header row gives []. If two header cells share a name, the later column wins.
 */
export function readHeaderTable(block: NestedBlock): Record<string, string>[] | null {
  if (block.type !== 'table' || !(block as any).table?.has_column_header) return null;
  const rows = (block.children ?? []).filter((b) => b.type === 'table_row');
  if (rows.length === 0) return null;
  const cellsOf = (row: NestedBlock): string[] =>
    ((row as any).table_row?.cells ?? []).map((cell: any[]) =>
      (cell ?? []).map((r: any) => r.plain_text ?? '').join('').trim(),
    );
  const header = cellsOf(rows[0]!);
  return rows.slice(1).map((row) => {
    const cells = cellsOf(row);
    return Object.fromEntries(header.map((name, i) => [name, cells[i] ?? '']));
  });
}
