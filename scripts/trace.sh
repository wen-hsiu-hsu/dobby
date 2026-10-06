#!/usr/bin/env bash
# 給 agent 查 /logs 用：token 從 .env 讀、用 Authorization header 送，不會出現在 URL 或對話裡。
# 用法：
#   npm run trace -- <reqId> [days]          單筆事件的精簡時間軸（等同 /logs?format=text&reqId=）
#   npm run trace -- --after <reqId> [N]     這筆之後（較新）的 N 筆事件，依時間先後列出，預設 20
#   npm run trace -- --list [days]           最近的事件清單（最新在上，最多 50 筆）
# 環境變數 LOGS_URL 可改查別台（預設 http://localhost:3000）。
set -o pipefail
cd "$(dirname "$0")/.." || exit 1

base="${LOGS_URL:-http://localhost:3000}"
token=$(grep -E '^LOGS_ACCESS_TOKEN=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'"'"'\r')
if [ -z "$token" ]; then
  echo ".env 裡沒有 LOGS_ACCESS_TOKEN" >&2
  exit 1
fi

fetch() { # $1 = query string；404（找不到 reqId）時印出伺服器訊息並回傳非 0
  local body code ctype
  body=$(curl -sS --max-time 20 -w '\n%{http_code} %{content_type}' -H "Authorization: Bearer ${token}" "${base}/logs?format=text&$1") || {
    echo "連不到 ${base}（dev server 沒開？）" >&2
    exit 1
  }
  code=${body##*$'\n'}
  ctype=${code#* }
  code=${code%% *}
  body=${body%$'\n'*}
  if [[ "$ctype" != text/plain* ]]; then
    echo "${base} 回的不是 /logs 純文字格式（HTTP ${code}，${ctype}），確認 LOGS_URL 指向 dobby" >&2
    exit 1
  fi
  if [ "$code" != 200 ]; then
    echo "HTTP ${code}：${body}" >&2
    exit 1
  fi
  printf '%s\n' "$body"
}

check_id() {
  [[ "$1" =~ ^[A-Za-z0-9]+$ ]] || { echo "reqId 格式不對：$1" >&2; exit 1; }
}

case "$1" in
  --list)
    fetch "days=${2:-1}"
    ;;
  --after)
    [ -n "$2" ] || { echo "用法：npm run trace -- --after <reqId> [N]" >&2; exit 1; }
    check_id "$2"
    n="${3:-20}"
    # 清單是最新在上：取目標那行以上的 N 行，再反轉成時間先後
    fetch "days=7" | awk -v id="$2" -v n="$n" '
      { line[NR] = $0 }
      index($0, id "\t") == 1 { hit = NR }
      END {
        if (!hit) { print "清單（最新 50 筆）裡找不到 " id "，可能太舊；改用單筆查詢" > "/dev/stderr"; exit 1 }
        from = hit - n; if (from < 1) from = 1
        for (i = hit; i >= from; i--) print line[i]
      }'
    ;;
  ""|-h|--help)
    sed -n 2,7p "$0"
    ;;
  *)
    check_id "$1"
    fetch "reqId=$1&days=${2:-1}"
    ;;
esac
