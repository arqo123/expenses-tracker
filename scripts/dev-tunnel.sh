#!/bin/bash
# Dev tunnel script - starts server, ngrok, and configures webhook automatically

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Load .env
cd "$PROJECT_ROOT"
if [ -f ".env" ]; then
    set -a
    source .env
    set +a
fi

# Configuration
PORT=${PORT:-3500}

# Check dependencies
if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
    echo -e "${RED}Error: TELEGRAM_BOT_TOKEN not set in .env${NC}"
    exit 1
fi

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}Stopping services...${NC}"
    pkill -f "ngrok http" 2>/dev/null || true
    lsof -ti:$PORT 2>/dev/null | xargs kill -9 2>/dev/null || true
    echo -e "${GREEN}Done${NC}"
}

trap cleanup EXIT INT TERM

# Kill existing processes
echo -e "${YELLOW}Cleaning up existing processes...${NC}"
pkill -f "ngrok http" 2>/dev/null || true
lsof -ti:$PORT 2>/dev/null | xargs kill -9 2>/dev/null || true
sleep 1

# Start server
echo -e "${BLUE}Starting server on port $PORT...${NC}"
bun run src/index.ts &
SERVER_PID=$!
sleep 2

if ! kill -0 $SERVER_PID 2>/dev/null; then
    echo -e "${RED}Server failed to start${NC}"
    exit 1
fi
echo -e "${GREEN}Server started (PID: $SERVER_PID)${NC}"

# Start ngrok
echo -e "${BLUE}Starting ngrok tunnel...${NC}"
ngrok http $PORT --log=stdout > /tmp/ngrok.log 2>&1 &
NGROK_PID=$!

# Wait for ngrok URL
echo -e "${YELLOW}Waiting for ngrok URL...${NC}"
NGROK_URL=""
for i in {1..30}; do
    NGROK_URL=$(curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null | grep -o '"public_url":"https://[^"]*' | head -1 | cut -d'"' -f4)
    if [ -n "$NGROK_URL" ]; then
        break
    fi
    sleep 0.5
done

if [ -z "$NGROK_URL" ]; then
    echo -e "${RED}Failed to get ngrok URL${NC}"
    exit 1
fi

echo -e "${GREEN}Ngrok URL: $NGROK_URL${NC}"

# Set webhook
WEBHOOK_URL="${NGROK_URL}/webhook/telegram"
echo -e "${BLUE}Setting webhook...${NC}"

curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteWebhook?drop_pending_updates=true" > /dev/null
RESULT=$(curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook?url=${WEBHOOK_URL}")

if echo "$RESULT" | grep -q '"ok":true'; then
    echo -e "${GREEN}Webhook set successfully!${NC}"
else
    echo -e "${RED}Webhook error: $RESULT${NC}"
    exit 1
fi

# Print status
echo ""
echo -e "${GREEN}========================================"
echo -e "  All systems running!"
echo -e "========================================${NC}"
echo -e "Server:  http://localhost:$PORT"
echo -e "Tunnel:  $NGROK_URL"
echo -e "Webhook: $WEBHOOK_URL"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
echo ""

# Monitor loop - restart if needed
while true; do
    sleep 30

    # Check server
    if ! kill -0 $SERVER_PID 2>/dev/null; then
        echo -e "${YELLOW}Server died, restarting...${NC}"
        bun run src/index.ts &
        SERVER_PID=$!
    fi

    # Check ngrok
    if ! kill -0 $NGROK_PID 2>/dev/null; then
        echo -e "${YELLOW}Ngrok died, restarting...${NC}"
        ngrok http $PORT --log=stdout > /tmp/ngrok.log 2>&1 &
        NGROK_PID=$!
        sleep 3

        NGROK_URL=$(curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null | grep -o '"public_url":"https://[^"]*' | head -1 | cut -d'"' -f4)
        if [ -n "$NGROK_URL" ]; then
            WEBHOOK_URL="${NGROK_URL}/webhook/telegram"
            curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteWebhook?drop_pending_updates=true" > /dev/null
            curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook?url=${WEBHOOK_URL}" > /dev/null
            echo -e "${GREEN}Webhook updated: $WEBHOOK_URL${NC}"
        fi
    fi
done
