import type { messagingApi } from '@line/bot-sdk';
import { replyMessage } from '../services/line/reply-service.js';

const COMMAND_LIST_TEXT = `🛠️ 指令列表
----------
（提醒：中文符號請用全形，+ 和 - 也支援全形 ＋ 和 －）

【查詢類】
未繳費名單
@Dobby owe
@Dobby 欠

查看指令列表（本頁）
@Dobby command
@Dobby 指令

查詢季度報名人
@Dobby participants
@Dobby 報名人
@Dobby people

查詢最新公告
@Dobby news
@Dobby 公告
@Dobby announcement

查詢付款資訊
@Dobby payment
@Dobby 付款

自我介紹
@Dobby

【報名或請假類】（僅限當季有效）
零打報名 N 位
@Dobby +N

取消報名 N 位
@Dobby -N

請假（季租成員限定）
@Dobby 假

銷假（季租成員限定）
@Dobby 銷假`;

// 只有 isAdmin === true 才會接在 COMMAND_LIST_TEXT 後面回傳；一般成員完全看不到這個章節存在。
const ADMIN_COMMAND_LIST_TEXT = `

【管理員專用】
幫 @Name 代為報名
@Dobby +N @Name

查看本週打球資訊
@Dobby next

產生新一季公告草稿
@Dobby season 2026Q2`;

export async function handleCommandList(replyToken: string, isAdmin: boolean): Promise<void> {
  const text = isAdmin ? COMMAND_LIST_TEXT + ADMIN_COMMAND_LIST_TEXT : COMMAND_LIST_TEXT;
  const messages: messagingApi.Message[] = [
    {
      type: 'text',
      text,
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
  await replyMessage(replyToken, messages);
}
