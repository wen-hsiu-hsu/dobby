import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  LINE_CHANNEL_SECRET: z.string().min(1),
  LINE_CHANNEL_ACCESS_TOKEN: z.string().min(1),
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
  DOBBY_GROUP_IDS: z
    .string()
    .default('')
    .transform((val) =>
      val
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id.length > 0)
    ),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),
  // 沒設定時邏輯層（log-upload.ts）用 NODE_ENV 當預設，不在這裡塞 default。
  R2_LOG_PREFIX: z.string().optional(),
  R2_LOG_SYNC_INTERVAL_MINUTES: z.coerce.number().int().positive().optional(),
});

// R2 四個核心變數（帳號、金鑰、bucket）必須「全部有值」或「全部沒值」——
// 避免只設了一部分卻沒注意到，導致功能看似啟用實際上呼叫 S3 API 時才炸開。
const R2_CORE_VARS = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME'] as const;

const schemaWithR2Refine = envSchema.superRefine((val, ctx) => {
  const present = R2_CORE_VARS.filter((key) => !!val[key]);
  if (present.length === 0 || present.length === R2_CORE_VARS.length) return;

  const missing = R2_CORE_VARS.filter((key) => !val[key]);
  ctx.addIssue({
    code: 'custom',
    message: `R2 log sync is partially configured — set all of ${R2_CORE_VARS.join(', ')} or none. Missing: ${missing.join(', ')}`,
    path: ['R2_ACCOUNT_ID'],
  });
});

export type Env = z.infer<typeof envSchema>;

const result = schemaWithR2Refine.safeParse(process.env);

if (!result.success) {
  console.error('Invalid environment variables:');
  console.error(result.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = result.data;
