#!/usr/bin/env bash
# PostToolUse(Edit|Write) hook：改到 src/*.ts 時跑 scripts/check-conventions.sh，有違規就回饋給 Claude（exit 2）。
f=$(jq -r '.tool_input.file_path // empty')
[[ "$f" == *.ts ]] || exit 0
cd "$CLAUDE_PROJECT_DIR" || exit 0
out=$(bash scripts/check-conventions.sh "$f") || { echo "$out" >&2; exit 2; }
exit 0
