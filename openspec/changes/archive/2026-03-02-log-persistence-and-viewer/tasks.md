## 1. Dependencies & Configuration

- [x] 1.1 Install `pino-roll` package
- [x] 1.2 Add `logs/` to `.gitignore`
- [x] 1.3 Update `docker-compose.yml` to add named volume mount for `logs/` directory

## 2. Log Persistence

- [x] 2.1 Update `src/utils/logger.ts`: in production, use `pino.multistream` to write JSON to both stdout and `pino-roll` file stream (`logs/YYYY-MM-DD.json`, daily rotation)
- [x] 2.2 Verify development mode is unchanged (pino-pretty to stdout only, no file output)

## 3. Log Cleanup

- [x] 3.1 Create `src/utils/log-cleanup.ts` with a function that deletes `logs/*.json` files older than 7 days
- [x] 3.2 Register cleanup in `src/index.ts`: run once at startup, then every 24 hours via `setInterval`

## 4. Log Viewer Route

- [x] 4.1 Create `src/utils/log-reader.ts` with a function to read and parse NDJSON log files from the past 7 days, returning an array of log entry objects sorted newest-first
- [x] 4.2 Create `src/routes/logs.ts` with `GET /logs` Express route that calls log-reader and renders an HTML response
- [x] 4.3 Implement HTML renderer in `src/routes/logs.ts`: table-based layout with level color badges, reqId, timestamp, and message columns
- [x] 4.4 Add client-side JS in the HTML: level filter buttons (error/warn/info/debug), time range selector (Today/Yesterday/Last 7 days), full-text search on msg field — all filtering DOM without reload
- [x] 4.5 Add row click to expand all additional JSON fields inline
- [x] 4.6 Register `/logs` route in `src/index.ts`

## 5. Verification

- [x] 5.1 Test locally: start app in production mode, verify `logs/YYYY-MM-DD.json` is created and entries appear
- [ ] 5.2 Test `GET /logs` renders correctly with real data and filters work in browser
- [ ] 5.3 Test Docker: `docker compose up`, verify volume persists logs after container restart
- [ ] 5.4 Test cleanup: manually create stale files, verify they are removed on startup
