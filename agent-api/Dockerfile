FROM python:3.11-slim

# Install Node.js 20 (needed for Claude Code CLI)
RUN apt-get update && apt-get install -y curl gnupg && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

# Install AgentAPI (latest release)
RUN ARCH=$(dpkg --print-architecture) && \
    curl -fsSL "https://github.com/coder/agentapi/releases/latest/download/agentapi_linux_${ARCH}" \
    -o /usr/local/bin/agentapi && \
    chmod +x /usr/local/bin/agentapi

# Set up working directory
WORKDIR /opt/peptide-agent

# Install Python deps
COPY api/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY api/ ./api/
COPY CLAUDE.md ./CLAUDE.md
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh

# Expose FastAPI port
EXPOSE 3500

CMD ["./entrypoint.sh"]
