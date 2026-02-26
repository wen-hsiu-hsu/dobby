import type { messagingApi } from '@line/bot-sdk';
import { replyMessage } from '../services/line/reply-service.js';

const COMMAND_LIST_TEXT = `Dobby 指令列表：

📋 報名/取消
@Dobby +N — 零打報名 N 位
@Dobby -N — 取消報名 N 位
@Dobby +N @Name — 幫 @Name 報名

🏸 季租成員
@Dobby 假 — 請假
@Dobby 銷假 — 銷假

📢 查詢
@Dobby 欠 / owe — 未繳費名單
@Dobby 報名人 / participants — 本季報名人
@Dobby 公告 / news — 最新公告
@Dobby 付款 / payment — 付款資訊
@Dobby — 自我介紹`;

export async function handleCommandList(replyToken: string, botId: string): Promise<void> {
  const messages: messagingApi.Message[] = [
    {
      type: 'text',
      text: COMMAND_LIST_TEXT,
      quickReply: {
        items: [
          { type: 'action', action: { type: 'message', label: '報名人', text: '@Dobby 報名人' } },
          { type: 'action', action: { type: 'message', label: '公告', text: '@Dobby 公告' } },
          { type: 'action', action: { type: 'message', label: '付款', text: '@Dobby 付款' } },
          { type: 'action', action: { type: 'message', label: '未繳費', text: '@Dobby 欠' } },
        ],
      },
    },
  ];
  await replyMessage(replyToken, messages, botId);
}
