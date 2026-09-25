import type { BlockObjectResponse } from '@notionhq/client/build/src/api-endpoints.js';

/**
 * A Notion block plus its already-fetched children (see
 * announcement-repository.ts's getBlocks, which recurses into `has_children`
 * blocks) — Notion's own API only returns one level of children per call.
 */
export type NestedBlock = BlockObjectResponse & { children?: NestedBlock[] };

function blockLine(block: NestedBlock, depth: number): string | null {
  const type = block.type as string;
  const content = (block as any)[type];
  if (!content) return null;
  const richText: any[] = content.rich_text ?? [];
  const text = richText.map((r: any) => r.plain_text ?? '').join('');
  if (!text) return null;
  const indent = '  '.repeat(depth);
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
 * `bulleted_list_item` blocks get a "• " prefix — every other block type is used as-is.
 * Nested blocks (toggle contents, sub-lists) are indented two spaces per depth level
 * and appear right after their parent's own line.
 */
export function blocksToText(blocks: NestedBlock[]): string {
  return flattenLines(blocks, 0).join('\n');
}
