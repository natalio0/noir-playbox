#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -d .venv ]]; then source .venv/bin/activate; fi
echo "Region Noir Playbox/Tuya kamu: sg"
echo "Jangan share Access Secret atau local_key ke siapa pun."
python -m tinytuya wizard -nocolor
