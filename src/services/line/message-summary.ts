import type { messagingApi } from '@line/bot-sdk';

type Message = messagingApi.Message;

/**
 * 把一則要送出的 LINE 訊息摘要成一行給 log 用：text 訊息直接回傳 `.text`；flex
 * 訊息回傳 `[flex] ${altText}`——altText 是卡片的精簡文字版，LINE 推播通知彈出時
 * 顯示的也是同一段文字，比單純印 `[flex]` 更有用，見
 * docs/adr/0010-registration-status-flex-card.md。其他型別 fallback 印 `[type]`。
 *
 * reply-service.ts（回覆）跟 push-service.ts（推播）共用這段邏輯，避免兩邊各自維護
 * 一份、之後改一邊忘記改另一邊。
 */
export function summarizeMessageForLog(message: Message): string {
  if (message.type === 'text') return (message as { type: string; text: string }).text;
  if (message.type === 'flex') return `[flex] ${(message as { type: string; altText: string }).altText}`;
  return `[${message.type}]`;
}
