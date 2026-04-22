#!/usr/bin/env bash
envfile="$1"
shift 1
if [ -z "$envfile" ]; then
  echo "Usage: dbun <env-file> <script> [script-args...]"
  exit 2
fi
dotenv -e "$envfile" -- bun run cmd-center.ts "$@"