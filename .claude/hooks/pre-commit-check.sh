#!/usr/bin/env bash
# PreToolUse(Bash) hook：agent 要執行 git commit 時，先跑型別檢查和測試，失敗就擋下（exit 2）。
# 工作區沒有程式相關改動（只改 docs/、TODO.md 等）時直接放行，不浪費 20 秒。
cmd=$(jq -r '.tool_input.command // empty')

# 只攔 git commit（含 git -C <dir> commit、串在 && 後面的情況）
echo "$cmd" | grep -qE '(^|[;&|(]\s*)git( -C [^ ]+)? commit( |$)' || exit 0

cd "$CLAUDE_PROJECT_DIR" || exit 0

# 已暫存或未暫存的改動裡有程式、測試或建置設定才檢查
git status --porcelain | grep -qE ' (src/|scripts/|package(-lock)?\.json|tsconfig|vitest\.config)' || exit 0

if ! tsc_out=$(npx tsc --noEmit 2>&1); then
  echo "commit 前檢查失敗：型別檢查沒過，先修正再 commit。" >&2
  echo "$tsc_out" | head -40 >&2
  exit 2
fi

if ! test_out=$(bash scripts/test-brief.sh 2>&1); then
  echo "commit 前檢查失敗：測試沒過，先修正再 commit。（工作區所有改動都算在內；若失敗來自這次不 commit 的改動，請告知使用者由他決定）" >&2
  echo "$test_out" | head -80 >&2
  exit 2
fi

exit 0
