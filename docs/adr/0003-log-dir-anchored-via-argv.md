# Log 目錄路徑錨定在 `process.argv[1]`，不要用 `import.meta.url`

`logs/` 目錄的實際位置（`src/index.ts` 算出的 `LOG_DIR`，往下傳給 `initLogger`、`startLogCleanup`、`createLogsRouter` 等函式）用 `process.argv[1]`（Node 執行時的進入點檔案路徑）取得，不是看起來更直覺的 `import.meta.url`。

直覺上 `import.meta.url` 應該可行：開發模式 `tsx watch src/index.ts` 直接執行原始 `src/index.ts`，正式環境執行 `tsup` 建置出的 `dist/index.cjs`，這兩個檔案剛好都在「離專案根目錄正好一層」的位置，理論上可以在 `import.meta.url` 上取 `dirname` 再往上一層算出根目錄。**但這個專案用 `tsup --format cjs` 建置成 CommonJS**，esbuild 對 CJS 輸出格式會把 `import.meta` 直接清空成 `{}`（建置時會印出 `empty-import-meta` 警告），`import.meta.url` 在建置後的 `dist/index.cjs` 裡是 `undefined`，`fileURLToPath(import.meta.url)` 會在服務啟動當下直接拋例外。開發模式（ESM，`tsx` 直接跑）不會有這個問題，所以**只在本機開發測試很容易誤以為這樣寫沒問題，實際上只有正式建置後的版本會啟動失敗**——這是本次（2026-09-17）修 log 機制時實際建置驗證才抓到的。

改用 `process.argv[1]`：不論是 `tsx src/index.ts` 還是 `node dist/index.cjs`，Node 都會把「被執行的進入點檔案路徑」放在這裡（可能是相對路徑或絕對路徑，取決於怎麼呼叫），所以要先 `resolve()` 成絕對路徑再算根目錄，且只在 `src/index.ts`（唯一的進入點）算一次，往下用參數傳給需要的函式，不要讓其他模組自己用 `import.meta.url`（或 `__dirname`）重算——一旦模組被 `tsup` bundle 進同一個 `dist/index.cjs`，每個模組各自的原始檔案位置資訊會消失，任何依賴「這個模組檔案在哪」的路徑計算在 bundle 後都會不準。

日後如果要改動 `LOG_DIR` 的算法，或有新的路徑需要錨定在專案根目錄，比照這個模式（進入點算一次、往下傳參數），不要在個別工具模組裡重新引入 `import.meta.url`／`__dirname`，且**務必實際跑一次 `npm run build && node dist/index.cjs` 驗證**，不能只憑開發模式測試通過就當作沒問題。
