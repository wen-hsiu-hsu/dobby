// Vitest setup file — runs before each test file, before any module is evaluated.
// Sets test environment variables so env.ts validation passes on first load.

process.env['NODE_ENV'] = 'test';
process.env['LINE_CHANNEL_SECRET_DOBBY'] = 'test-secret-dobby';
process.env['LINE_CHANNEL_ACCESS_TOKEN_DOBBY'] = 'test-token-dobby';
process.env['LINE_CHANNEL_SECRET_BATTING'] = 'test-secret-batting';
process.env['LINE_CHANNEL_ACCESS_TOKEN_BATTING'] = 'test-token-batting';
process.env['NOTION_API_KEY'] = 'test-notion-key';
process.env['NOTION_DB_USERS'] = 'test-db-users';
process.env['NOTION_DB_CALENDAR'] = 'test-db-calendar';
process.env['NOTION_DB_PEOPLE'] = 'test-db-people';
process.env['NOTION_DB_SEASON'] = 'test-db-season';
process.env['NOTION_DB_ANNOUNCEMENT'] = 'test-db-announcement';
process.env['PORT'] = '3000';
