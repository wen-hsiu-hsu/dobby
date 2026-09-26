import { CommandType } from '../types/commands.js';
import type { ParsedCommand } from '../types/commands.js';
import { handleIntroduce } from './introduce.js';
import { handleOwe } from './owe.js';
import { handleCommandList } from './command-list.js';
import { handleParticipants } from './participants.js';
import { handleNextEvent } from './next-event.js';
import { handleNews } from './news.js';
import { handlePayment } from './payment.js';
import { handleSeasonAnnouncement } from './season-announcement.js';
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
  isAdmin: boolean
): Promise<void> {
  switch (command.type) {
    case CommandType.INTRODUCE:
      await handleIntroduce(event.replyToken, event.source.userId);
      break;
    case CommandType.OWE:
      await handleOwe(event.replyToken);
      break;
    case CommandType.COMMAND_LIST:
      await handleCommandList(event.replyToken, isAdmin);
      break;
    case CommandType.PARTICIPANTS:
      await handleParticipants(event.replyToken);
      break;
    case CommandType.NEXT_EVENT:
      await handleNextEvent(event.replyToken, isAdmin);
      break;
    case CommandType.NEWS:
      await handleNews(event.replyToken);
      break;
    case CommandType.PAYMENT:
      await handlePayment(event.replyToken);
      break;
    case CommandType.SEASON_ANNOUNCEMENT:
      await handleSeasonAnnouncement(event.replyToken, isAdmin, command.seasonArg);
      break;
    case CommandType.REGISTRATION: {
      const delta = parseInt(command.delta ?? '+1', 10);
      await handleRegistration(event as any, delta, isAdmin);
      break;
    }
    case CommandType.LEAVE:
      await handleLeave(event as any, false, isAdmin);
      break;
    case CommandType.CANCEL_LEAVE:
      await handleLeave(event as any, true, isAdmin);
      break;
    default:
      // Unknown command - ignore
      break;
  }
}
