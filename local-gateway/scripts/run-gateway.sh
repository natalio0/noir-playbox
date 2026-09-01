#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p logs

if [[ -d .venv ]]; then
  source .venv/bin/activate
fi

exec python -u gateway.py serve
