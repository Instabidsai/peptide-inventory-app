#!/bin/bash
set -e

echo "=== Merchant Onboarding Agent ==="
echo "Starting AgentAPI on port 8100..."

# Start AgentAPI wrapping Claude Code CLI in background
# --workdir points to our CLAUDE.md persona directory
agentapi server \
  --port 8100 \
  -- claude --dangerously-skip-permissions \
  &

# Wait for AgentAPI to be ready
echo "Waiting for AgentAPI..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:8100/health > /dev/null 2>&1; then
    echo "AgentAPI ready!"
    break
  fi
  sleep 2
done

echo "Starting FastAPI on port 3500..."
cd /opt/peptide-agent
exec uvicorn api.main:app --host 0.0.0.0 --port 3500 --log-level info
