#!/bin/bash
set -e

echo "=== voscribe setup ==="

# Install Node.js dependencies
echo "[1/3] Installing Node.js dependencies..."
npm install

# Check Python 3
echo "[2/3] Checking Python environment..."
if ! command -v python3 &> /dev/null; then
  echo "ERROR: python3 not found. Please install Python 3.10+."
  exit 1
fi

PYTHON_VERSION=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
echo "  Python version: $PYTHON_VERSION"

# Install Python dependencies
echo "[3/3] Installing Python dependencies..."
pip3 install -r python/requirements.txt

echo ""
echo "=== Setup complete! ==="
echo "Run: npm start"
