#!/usr/bin/env bash
# Checks the tools the system relies on but does not install: git and the GitHub CLI.
set -euo pipefail

fail=0
for tool in git gh; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "missing: $tool" >&2
    fail=1
  fi
done

if command -v gh >/dev/null 2>&1 && ! gh auth status >/dev/null 2>&1; then
  echo "gh is not authenticated: run 'gh auth login'" >&2
  fail=1
fi

if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  echo "note: ANTHROPIC_API_KEY is not set; the Claude Engine needs it (or Bedrock/Vertex variables)" >&2
fi

exit "$fail"
