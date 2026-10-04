// Vitest setup file — runs before each test file, before any module is evaluated.
// Sets test environment variables so env.ts validation passes on first load.

import { beforeEach } from 'vitest';

process.env['NODE_ENV'] = 'test';
process.env['LINE_CHANNEL_SECRET'] = 'test-secret-dobby';
process.env['LINE_CHANNEL_ACCESS_TOKEN'] = 'test-token-dobby';
process.env['NOTION_API_KEY'] = 'test-notion-key';
process.env['NOTION_DB_USERS'] = 'test-db-users';
process.env['NOTION_DB_CALENDAR'] = 'test-db-calendar';
process.env['NOTION_DB_PEOPLE'] = 'test-db-people';
process.env['NOTION_DB_SEASON'] = 'test-db-season';
process.env['NOTION_DB_ANNOUNCEMENT'] = 'test-db-announcement';
process.env['LOGS_ACCESS_TOKEN'] = 'test-logs-token';
process.env['PORT'] = '3000';

// 讀取快取是模組層級的狀態，同一個測試檔裡的測試會互相污染（ADR 0020）。用動態 import：
// 靜態 import 會被提升到上面設定環境變數之前執行，env.ts 驗證會失敗。
beforeEach(async () => {
  const { clearAllReadCaches } = await import('../services/notion/read-cache.js');
  clearAllReadCaches();
});
