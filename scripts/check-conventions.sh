#!/usr/bin/env bash
# 機械式檢查 CLAUDE.md「專案慣例」裡能用 grep 判斷的幾條，有違規就列出並 exit 1。
# 用法：bash scripts/check-conventions.sh [檔案 ...]   不給檔案就檢查整個 src/
# 測試檔、src/test-utils/ 不檢查。
cd "$(dirname "$0")/.." || exit 1

if [ $# -gt 0 ]; then
  files=()
  for f in "$@"; do
    f=${f#"$PWD/"}
    [[ "$f" == src/*.ts && -f "$f" ]] && files+=("$f")
  done
else
  files=(); while IFS= read -r f; do files+=("$f"); done < <(find src -name '*.ts')
fi

violations=()
for f in "${files[@]}"; do
  [[ "$f" == *.test.ts || "$f" == */__tests__/* || "$f" == src/test-utils/* ]] && continue

  # 1. 回覆一律用 replyMessage；pushMessage 只有週報推播能用
  if [[ "$f" != src/services/line/push-service.ts && "$f" != src/schedulers/weekly-push.ts ]]; then
    while IFS= read -r hit; do
      violations+=("$f:${hit%%:*}  用了 pushMessage（只有 schedulers/weekly-push.ts 可以用，其他一律 replyMessage）")
    done < <(grep -n 'pushMessage' "$f")
  fi

  # 2. Notion 存取一律走 repository
  if [[ "$f" != src/services/notion/* && "$f" != src/config/* ]]; then
    while IFS= read -r hit; do
      violations+=("$f:${hit%%:*}  直接 import Notion SDK／notion-fetch（要走 src/services/notion/*-repository.ts）")
    done < <(grep -nE "from ['\"](@notionhq/client|[./]*.*notion-fetch(\.js)?)['\"]" "$f")
  fi

  # 3. 環境變數只能在 env.ts 的 zod schema 讀
  if [[ "$f" != src/config/env.ts ]]; then
    while IFS= read -r hit; do
      violations+=("$f:${hit%%:*}  直接讀 process.env（要加進 src/config/env.ts 的 zod schema，缺值 fail-fast）")
    done < <(grep -n 'process\.env' "$f" | grep -v '^\s*[0-9]*:\s*//')
  fi

  # 4. repository 的 export 入口函式要用 withPurpose 包住本體（ADR 0005）
  #    函式開頭 4 行內要出現 withPurpose(；只轉呼叫其他已標註函式的，在 export 上一行註明 purpose-exempt
  if [[ "$f" == src/services/notion/*-repository.ts ]]; then
    while IFS= read -r hit; do
      violations+=("$f:$hit  export 函式沒有用 withPurpose 包住（/logs 看不到呼叫目的）；只轉呼叫的話在上一行加 // purpose-exempt: <理由>")
    done < <(awk '
      /^export (async )?function / {
        if (prev ~ /purpose-exempt/) { prev = $0; next }
        name = $0; sub(/^export (async )?function /, "", name); sub(/[(<].*/, "", name)
        start = NR; pending = 1; prev = $0; next
      }
      pending && /withPurpose\(/ { pending = 0 }
      pending && NR - start > 4 { print start ":" name; pending = 0 }
      { prev = $0 }
      END { if (pending) print start ":" name }
    ' "$f" | sed 's/:\(.*\)/  \1/')
  fi
done

if [ ${#violations[@]} -gt 0 ]; then
  echo "專案慣例檢查（scripts/check-conventions.sh）發現 ${#violations[@]} 處："
  printf '  %s\n' "${violations[@]}"
  exit 1
fi
