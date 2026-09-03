#!/usr/bin/env bash
set -e

echo "=================================================="
echo "⚡ Deploying Turbine Relay to Fly.io (Low Latency)"
echo "=================================================="

# Check if flyctl is installed
if ! command -v flyctl &> /dev/null && ! command -v fly &> /dev/null; then
  echo "Installing flyctl via Homebrew..."
  brew install flyctl
fi

FLY_CMD=$(command -v fly || command -v flyctl)
echo "Using Fly CLI: $FLY_CMD"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RELAY_DIR="$(dirname "$SCRIPT_DIR")"
cd "$RELAY_DIR"

# Check authentication
if ! $FLY_CMD auth whoami &> /dev/null; then
  echo "Please authenticate with Fly.io in the browser window..."
  $FLY_CMD auth login
fi

echo "Deploying relay server from $RELAY_DIR..."
$FLY_CMD deploy

echo "=================================================="
echo "✅ Deployment complete!"
echo "Your relay server is now live with global edge routing."
echo "=================================================="
