import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  LINE_CHANNEL_SECRET_DOBBY: z.string().min(1),
  LINE_CHANNEL_ACCESS_TOKEN_DOBBY: z.string().min(1),
  LINE_CHANNEL_SECRET_BATTING: z.string().min(1),
  LINE_CHANNEL_ACCESS_TOKEN_BATTING: z.string().min(1),
  NOTION_API_KEY: z.string().min(1),
  NOTION_DB_USERS: z.string().min(1),
  NOTION_DB_CALENDAR: z.string().min(1),
  NOTION_DB_PEOPLE: z.string().min(1),
  NOTION_DB_SEASON: z.string().min(1),
  NOTION_DB_ANNOUNCEMENT: z.string().min(1),
  LOGS_ACCESS_TOKEN: z.string().min(1),
  PORT: z.string().default('3000'),
  NODE_ENV: z.string().default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  DOBBY_GROUP_ID: z.string().default(''),
});

export type Env = z.infer<typeof envSchema>;

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('Invalid environment variables:');
  console.error(result.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = result.data;
