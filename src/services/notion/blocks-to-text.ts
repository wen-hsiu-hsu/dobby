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

function blockLine(block: NestedBlock, depth: number): string | null {
  const type = block.type as string;
  const indent = '  '.repeat(depth);
  if (type === 'divider') return `${indent}${DIVIDER_LINE}`;
  const content = (block as any)[type];
  if (!content) return null;
  const richText: any[] = content.rich_text ?? [];
  const text = richText.map((r: any) => r.plain_text ?? '').join('');
  if (!text) {
    // An empty paragraph is a blank line the admin typed in Notion — keep it.
    // Other empty blocks (an empty toggle's own line, images, …) have nothing to show.
    return type === 'paragraph' ? '' : null;
  }
  return type === 'bulleted_list_item' ? `${indent}• ${text}` : `${indent}${text}`;
}

function flattenLines(blocks: NestedBlock[], depth: number): string[] {
  const lines: string[] = [];
  for (const block of blocks) {
    const line = blockLine(block, depth);
    if (line !== null) lines.push(line);
    if (block.children && block.children.length > 0) {
      lines.push(...flattenLines(block.children, depth + 1));
    }
  }
  return lines;
}

/**
 * Flattens Notion block children into plain text, one block per line.
 * `bulleted_list_item` blocks get a "• " prefix, `divider` blocks become "—",
 * and empty paragraphs become blank lines — every other block type is used as-is.
 * Blank lines at the very start/end are dropped (e.g. PAYMENT's trailing empty
 * paragraph), but a first line's indentation is kept.
 * Nested blocks (toggle contents, sub-lists) are indented two spaces per depth level
 * and appear right after their parent's own line.
 */
export function blocksToText(blocks: NestedBlock[]): string {
  const lines = flattenLines(blocks, 0);
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start] === '') start++;
  while (end > start && lines[end - 1] === '') end--;
  return lines.slice(start, end).join('\n');
}
