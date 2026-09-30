import type { messagingApi } from '@line/bot-sdk';

type Message = messagingApi.Message;

/**
 * 從一則 LINE 回覆訊息取出「主要文字內容」給測試斷言用：text/textV2 直接回傳
 * `.text`，flex 回傳 `.altText`（卡片本身沒有單一字串可比對，altText 是它的
 * 精簡文字版；狀態卡的規則見 flex-status-card.ts 的 buildStatusCardAltText，
 * 指令清單卡、名單卡見 ADR 0012、0013）。
 *
 * 報名／請假的狀態回覆改成 Flex 卡片後，既有測試裡到處讀 `.text` 的斷言會
 * 因為 flex 訊息沒有 `.text` 欄位而壞掉——這個 helper 讓測試不用關心某個分支
 * 現在是 text 還是 flex，繼續用字串斷言內容。
 */
export function replyText(message: Message): string {
  if (message.type === 'text' || message.type === 'textV2') return message.text;
  if (message.type === 'flex') return message.altText;
  throw new Error(`replyText: unsupported message type "${message.type}"`);
}
