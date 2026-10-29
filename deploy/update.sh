#!/bin/bash
# ============================================================
# AgentDesk Update Script — run on VM to pull latest changes
# Usage: cd /opt/agentdesk && bash deploy/update.sh
# ============================================================

set -e
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[update]${NC} $1"; }
warn() { echo -e "${YELLOW}[warn]${NC} $1"; }

cd /opt/agentdesk

log "Pulling latest code..."
git pull origin master

log "Installing any new dependencies..."
npm install --prefix apps/api
npm install --prefix apps/web

log "Running new migrations (if any)..."
cd apps/api
npx ts-node src/database/migrate.ts && log "Migrations OK" || warn "Migration skipped"
cd ../..

log "Rebuilding frontend..."
npm run build --prefix apps/web

log "Restarting API..."
pm2 restart agentdesk-api

log "Update complete!"
pm2 status
