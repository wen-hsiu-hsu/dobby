import type { BlockObjectResponse } from '@notionhq/client/build/src/api-endpoints.js';

/**
 * Flattens Notion block children into plain text, one block per line.
 * `bulleted_list_item` blocks get a "• " prefix — every other block type is used as-is.
 */
export function blocksToText(blocks: BlockObjectResponse[]): string {
  return blocks
    .map((block) => {
      const type = block.type as string;
      const content = (block as any)[type];
      if (!content) return '';
      const richText: any[] = content.rich_text ?? [];
      const text = richText.map((r: any) => r.plain_text ?? '').join('');
      if (!text) return '';
      return type === 'bulleted_list_item' ? `• ${text}` : text;
    })
    .filter(Boolean)
    .join('\n');
}
