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
