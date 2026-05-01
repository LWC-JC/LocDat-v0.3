#!/usr/bin/env bash
# LocDat launcher — Mac/Linux
cd "$(dirname "$0")"

if command -v python3 >/dev/null 2>&1; then
    # Open browser in background after short delay
    (sleep 1 && (open http://localhost:8765 2>/dev/null || xdg-open http://localhost:8765 2>/dev/null)) &
    python3 -m http.server 8765
else
    echo "Python 3 not found. Please install it and re-run this script."
    exit 1
fi
