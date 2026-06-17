#!/usr/bin/env bash
# ===================================================
#   PNL Forecast -- macOS / Linux startup
#   Usage: ./run.sh [dev|prod]   (default: dev)
# ===================================================
set -euo pipefail
cd "$(dirname "$0")"

MODE="${1:-dev}"

# --- Check Python ---
if ! command -v python3 >/dev/null 2>&1; then
    echo "[ERROR] python3 not found in PATH. Install Python 3.10+ first."
    exit 1
fi

# --- Virtual environment ---
if [ ! -d ".venv" ]; then
    echo "[1/3] Creating virtual environment (.venv)..."
    python3 -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate

echo "[2/3] Installing/updating dependencies..."
pip install -r requirements.txt --quiet

PORT="${FLASK_PORT:-5050}"
if [ "$MODE" = "prod" ]; then
    echo "[3/3] Starting in PRODUCTION mode (Waitress WSGI) on port ${PORT}..."
    export FLASK_DEBUG=false
    python -c "from waitress import serve; from app import app; import os; port=int(os.getenv('FLASK_PORT','5050')); print(f'Waitress serving on http://0.0.0.0:{port}'); serve(app, host='0.0.0.0', port=port, threads=4)"
else
    echo "[3/3] Starting in DEVELOPMENT mode (Flask dev server) on port ${PORT}..."
    echo "      Press Ctrl+C to stop."
    export FLASK_DEBUG=true
    python app.py
fi
