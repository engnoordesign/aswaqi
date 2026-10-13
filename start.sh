#!/bin/sh
# Aswaqi - start on macOS/Linux: sh start.sh  (keep the terminal open; Ctrl+C stops it)
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then echo "Node.js is not installed. Install Node.js 24 or newer from https://nodejs.org"; exit 1; fi
if ! node -e "process.exit(Number(process.versions.node.split('.')[0])>=24?0:1)"; then echo "Aswaqi needs Node.js 24 or newer (you have $(node --version))."; exit 1; fi
URL="http://localhost:${PORT:-3000}"
( sleep 2; if [ "$(uname)" = Darwin ]; then open "$URL"; else xdg-open "$URL"; fi ) >/dev/null 2>&1 &
exec node --disable-warning=ExperimentalWarning --env-file-if-exists=.env server.js
