#!/usr/bin/env bash
# 給 agent 用的精簡測試輸出：固定 --dir src（避免掃到 .claude/worktrees 的測試），
# 通過只印摘要，失敗只印 vitest 最後的失敗報告，不印 pino log。
# 用法：npm run test:brief [-- <檔案路徑> ... | -t "測試名稱"]
set -o pipefail

out=$(mktemp)
trap 'rm -f "$out"' EXIT

npx vitest run --dir src --reporter=dot "$@" >"$out" 2>&1
status=$?

# 去掉 ANSI 色碼再過濾
clean=$(sed 's/\x1b\[[0-9;]*m//g' "$out")

if [ $status -eq 0 ]; then
  echo "$clean" | grep -E '^ *(Test Files|Tests|Duration) '
else
  # vitest 的失敗報告從「⎯ Failed Tests」或「⎯ Failed Suites」開始，到摘要結束
  report=$(echo "$clean" | awk '/⎯+ Failed (Tests|Suites)/{p=1} p')
  if [ -n "$report" ]; then
    echo "$report" | head -200
  else
    # 型別或設定錯誤等沒有失敗報告的情況，印最後 60 行
    echo "$clean" | tail -60
  fi
fi
exit $status
