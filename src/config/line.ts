import { messagingApi } from '@line/bot-sdk';
import { env } from './env.js';

export const dobbyClient = new messagingApi.MessagingApiClient({
  channelAccessToken: env.LINE_CHANNEL_ACCESS_TOKEN_DOBBY,
});

export const battingClient = new messagingApi.MessagingApiClient({
  channelAccessToken: env.LINE_CHANNEL_ACCESS_TOKEN_BATTING,
});

export function getClient(botId: string): messagingApi.MessagingApiClient {
  if (botId === 'batting') return battingClient;
  return dobbyClient;
}
