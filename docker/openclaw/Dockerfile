FROM node:24-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl tini \
    && rm -rf /var/lib/apt/lists/*

# Install OpenClaw globally
RUN npm install -g openclaw@latest

# Config and data directory for the node user
RUN mkdir -p /home/node/.openclaw && chown node:node /home/node/.openclaw

USER node
WORKDIR /home/node

EXPOSE 18789

# --bind 0.0.0.0 overrides the default loopback-only binding so the Docker
# port mapping (127.0.0.1:18789:18789 in compose) can forward traffic in.
ENTRYPOINT ["tini", "--"]
# --bind auto: container env auto-detected, binds 0.0.0.0 for port-forward compatibility
# OPENCLAW_GATEWAY_TOKEN is required to allow non-loopback binding (set in docker-compose)
CMD ["openclaw", "gateway", "--allow-unconfigured"]
