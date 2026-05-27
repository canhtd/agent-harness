#!/usr/bin/env bash
set -euo pipefail

IDENTIFIER="${1:?Usage: watch.sh <IDENTIFIER>}"
LOG="$HOME/.agent-harness/logs/${IDENTIFIER}.log"

if [ ! -f "$LOG" ]; then
  echo "Log not found: $LOG"
  exit 1
fi

# Detect color support
if [ -t 1 ] && command -v tput &>/dev/null && [ "$(tput colors 2>/dev/null)" -ge 8 ]; then
  CYAN=$'\033[36m'
  RED=$'\033[31m'
  DIM=$'\033[2m'
  BOLD=$'\033[1m'
  RESET=$'\033[0m'
else
  CYAN="" RED="" DIM="" BOLD="" RESET=""
fi

truncate_str() {
  local s="$1" max="${2:-120}"
  if [ "${#s}" -gt "$max" ]; then
    printf '%s…' "${s:0:$max}"
  else
    printf '%s' "$s"
  fi
}

if command -v jq &>/dev/null; then
  parse_line() {
    local line="$1"
    local type subtype

    type=$(echo "$line" | jq -r '.type // empty' 2>/dev/null) || return
    [ -z "$type" ] && return

    case "$type" in
      system)
        subtype=$(echo "$line" | jq -r '.subtype // empty' 2>/dev/null)
        if [ "$subtype" = "init" ]; then
          local model
          model=$(echo "$line" | jq -r '.model // "unknown"' 2>/dev/null)
          echo "${DIM}⚡ Session started — model: ${model}${RESET}"
        fi
        ;;
      assistant)
        local content_types
        content_types=$(echo "$line" | jq -r '.message.content[]?.type // empty' 2>/dev/null)
        for ct in $content_types; do
          case "$ct" in
            text)
              local text
              text=$(echo "$line" | jq -r '[.message.content[] | select(.type=="text") | .text] | join(" ")' 2>/dev/null)
              [ -n "$text" ] && echo "🤖 $(truncate_str "$text" 120)"
              ;;
            tool_use)
              echo "$line" | jq -r '.message.content[] | select(.type=="tool_use") | "\(.name)\t\(.input | tostring)"' 2>/dev/null | while IFS=$'\t' read -r name input; do
                local preview
                preview=$(truncate_str "$input" 80)
                echo "${CYAN}🔧 ${name}${RESET}(${preview})"
              done
              ;;
          esac
        done
        ;;
      user)
        echo "$line" | jq -r '.message.content[]? | select(.type=="tool_result") | "\(.is_error)\t\(.content // "")"' 2>/dev/null | while IFS=$'\t' read -r is_error content; do
          if [ "$is_error" = "true" ]; then
            echo "${RED}❌ $(truncate_str "$content" 120)${RESET}"
          else
            echo "✅ $(truncate_str "$content" 120)"
          fi
        done
        ;;
      result)
        local result
        result=$(echo "$line" | jq -r '.result // empty' 2>/dev/null)
        [ -n "$result" ] && echo "${BOLD}🏁 Result: $(truncate_str "$result" 120)${RESET}"
        ;;
    esac
  }
else
  parse_line() {
    local line="$1"
    python3 -c "
import json, sys
try:
    d = json.loads(sys.argv[1])
except: sys.exit(0)
t = d.get('type','')
def trunc(s, n=120):
    s = str(s).replace('\n',' ')
    return s[:n]+'…' if len(s)>n else s
if t=='system' and d.get('subtype')=='init':
    print('${DIM}⚡ Session started — model: '+d.get('model','unknown')+'${RESET}')
elif t=='assistant':
    for c in d.get('message',{}).get('content',[]):
        if c.get('type')=='text' and c.get('text'):
            print('🤖 '+trunc(c['text']))
        elif c.get('type')=='tool_use':
            preview=trunc(json.dumps(c.get('input',{})),80)
            print('${CYAN}🔧 '+c.get('name','')+'${RESET}('+preview+')')
elif t=='user':
    for c in d.get('message',{}).get('content',[]):
        if c.get('type')=='tool_result':
            content=trunc(c.get('content',''))
            if c.get('is_error'):
                print('${RED}❌ '+content+'${RESET}')
            else:
                print('✅ '+content)
elif t=='result':
    r=d.get('result','')
    if r: print('${BOLD}🏁 Result: '+trunc(r)+'${RESET}')
" "$line" 2>/dev/null
  }
fi

cleanup() { kill 0 2>/dev/null; }
trap cleanup EXIT INT TERM

tail -f "$LOG" | while IFS= read -r line; do
  parse_line "$line"
done
