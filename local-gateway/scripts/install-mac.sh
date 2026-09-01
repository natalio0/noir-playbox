#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

command -v python3 >/dev/null || {
  echo "Python 3 belum tersedia."
  exit 1
}

python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements-mac.txt

if [[ ! -f config/playboxes.json ]]; then
  cp config/playboxes.example.json config/playboxes.json
fi

echo
echo "Install selesai."
echo "Aktifkan env dengan: source .venv/bin/activate"
echo "Lalu jalankan: python -m tinytuya scan"
