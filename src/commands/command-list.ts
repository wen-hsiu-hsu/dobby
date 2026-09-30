import { replyMessage } from '../services/line/reply-service.js';
import { getCurrentSeasonName, getNextSeasonName } from '../utils/date-utils.js';
import { buildCommandListAltText, buildCommandListBubble, type CommandListCardParams } from './command-list-card.js';

export async function handleCommandList(replyToken: string, isAdmin: boolean): Promise<void> {
  // 「下一季公告草稿」按鈕：以今天所在季度的下一季為準（管理員通常在季末準備下一季公告）。
  const params: CommandListCardParams = { isAdmin, nextSeasonName: getNextSeasonName(getCurrentSeasonName()) };
  await replyMessage(replyToken, [
    { type: 'flex', altText: buildCommandListAltText(params), contents: buildCommandListBubble(params) },
  ]);
}
