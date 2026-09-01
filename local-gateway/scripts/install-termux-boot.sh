#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BOOT_DIR="$HOME/.termux/boot"
BOOT_FILE="$BOOT_DIR/20-noir-playbox-gateway"

mkdir -p "$BOOT_DIR" "$PROJECT_DIR/logs"

cat > "$BOOT_FILE" <<EOF
#!/data/data/com.termux/files/usr/bin/bash
termux-wake-lock
cd "$PROJECT_DIR"

while true; do
  python -u gateway.py serve >> logs/gateway.log 2>&1
  echo "\$(date -Iseconds) gateway exited; restarting in 5s" >> logs/gateway.log
  sleep 5
done
EOF

chmod +x "$BOOT_FILE"

echo "Boot script dibuat: $BOOT_FILE"
echo "PENTING: install Termux:Boot dari sumber yang sama dengan Termux, buka aplikasinya sekali."
