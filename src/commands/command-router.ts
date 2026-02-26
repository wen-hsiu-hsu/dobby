import { CommandType } from '../types/commands.js';
import type { ParsedCommand } from '../types/commands.js';
import { handleIntroduce } from './introduce.js';
import { handleOwe } from './owe.js';
import { handleCommandList } from './command-list.js';
import { handleParticipants } from './participants.js';
import { handleNextEvent } from './next-event.js';
import { handleNews } from './news.js';
import { handlePayment } from './payment.js';
import { handleRegistration } from './registration/registration-handler.js';
import { handleLeave } from './registration/leave-handler.js';

interface CommandEvent {
  replyToken: string;
  message: { text: string; mention?: unknown };
  source: { userId: string };
}

export async function routeCommand(
  command: ParsedCommand,
  event: CommandEvent,
  botId: string,
  isAdmin: boolean
): Promise<void> {
  switch (command.type) {
    case CommandType.INTRODUCE:
      await handleIntroduce(event.replyToken, event.source.userId, botId);
      break;
    case CommandType.OWE:
      await handleOwe(event.replyToken, botId);
      break;
    case CommandType.COMMAND_LIST:
      await handleCommandList(event.replyToken, botId);
      break;
    case CommandType.PARTICIPANTS:
      await handleParticipants(event.replyToken, botId);
      break;
    case CommandType.NEXT_EVENT:
      await handleNextEvent(event.replyToken, botId, isAdmin, command.queryParams);
      break;
    case CommandType.NEWS:
      await handleNews(event.replyToken, botId);
      break;
    case CommandType.PAYMENT:
      await handlePayment(event.replyToken, botId);
      break;
    case CommandType.REGISTRATION: {
      const delta = parseInt(command.delta ?? '+1', 10);
      await handleRegistration(event as any, delta, botId);
      break;
    }
    case CommandType.LEAVE:
      await handleLeave(event as any, false, botId);
      break;
    case CommandType.CANCEL_LEAVE:
      await handleLeave(event as any, true, botId);
      break;
    default:
      // Unknown command - ignore
      break;
  }
}
