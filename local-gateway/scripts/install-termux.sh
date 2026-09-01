#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

pkg update -y
pkg install -y python git openssl libffi

python -m pip install --upgrade pip
# TinyTuya supports PyCryptodome as the lightweight crypto backend.
python -m pip install pycryptodome requests colorama
python -m pip install --no-deps tinytuya==1.20.0

if [[ ! -f config/playboxes.json ]]; then
  cp config/playboxes.example.json config/playboxes.json
fi

mkdir -p logs

echo
echo "Termux gateway dependencies selesai."
echo "Jalankan: python gateway.py list"
