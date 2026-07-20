#!/bin/bash
# CyberShield Watchdog — full auto-recovery for ngrok + flask
cd /root/Documents/Codex/2026-07-20/new-chat-2/cyber-shield

log() { echo "[$(date '+%H:%M:%S')] $*"; }
MAX_RETRIES=5

while true; do
    # === Check Flask ===
    if ! curl -s -o /dev/null --max-time 5 http://127.0.0.1:5000/ 2>/dev/null; then
        log "⚠️  Flask down, restarting..."
        tmux kill-session -t cybershield 2>/dev/null
        sleep 1
        tmux new-session -d -s cybershield "python3 app.py"
        sleep 3
        log "✅ Flask restarted"
    fi

    # === Check ngrok ===
    # First check if ngrok process is alive
    NGROK_PID=$(pgrep -f "ngrok http" | head -1)
    NGROK_API=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://127.0.0.1:4040/api/tunnels 2>/dev/null)

    if [ -z "$NGROK_PID" ] || [ "$NGROK_API" != "200" ]; then
        log "⚠️  ngrok down, restarting..."
        pkill -f "ngrok http" 2>/dev/null
        sleep 2
        tmux kill-session -t ngrok 2>/dev/null
        tmux new-session -d -s ngrok "ngrok http 5000 --log=stdout --region=us"
        log "⏳ Waiting for ngrok connection..."

        # Wait for ngrok to connect (with timeout)
        CONNECTED=0
        for i in $(seq 1 30); do
            sleep 2
            TUNNEL=$(curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null | python3 -c "
import sys,json
try:
    d=json.load(sys.stdin)
    for t in d.get('tunnels',[]):
        if t['public_url']:
            print(t['public_url'])
            break
except: pass
" 2>/dev/null)
            if [ -n "$TUNNEL" ]; then
                log "✅ ngrok connected: $TUNNEL"
                CONNECTED=1
                break
            fi
            # Check if latest log has error about connection timeout
            LOGS=$(tmux capture-pane -t ngrok -p -S -3 2>/dev/null)
            if echo "$LOGS" | grep -q "i/o timeout"; then
                log "⏳ Still connecting..."
            fi
        done

        if [ "$CONNECTED" -eq 0 ]; then
            log "❌ ngrok failed to connect after 60s, will retry next cycle"
        fi
    fi

    sleep 30
done
