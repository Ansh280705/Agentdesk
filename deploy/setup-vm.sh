#!/bin/bash
# ============================================================
# AgentDesk VM Setup Script
# Run this on a fresh Ubuntu 22.04 VM (Oracle Cloud, AWS, GCP)
# Usage: curl -fsSL <url>/setup-vm.sh | bash
#        OR: chmod +x setup-vm.sh && ./setup-vm.sh
# ============================================================

set -e
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[setup]${NC} $1"; }
warn() { echo -e "${YELLOW}[warn]${NC} $1"; }
err()  { echo -e "${RED}[error]${NC} $1"; exit 1; }

log "Starting AgentDesk VM setup..."

# ── 1. System update ──────────────────────────────────────
log "Updating system packages..."
sudo apt-get update -qq
sudo apt-get upgrade -y -qq
sudo apt-get install -y -qq \
  curl wget git unzip build-essential \
  nginx certbot python3-certbot-nginx \
  ca-certificates gnupg lsb-release

# ── 2. Node.js 20 (LTS) ──────────────────────────────────
log "Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version
npm --version

# ── 3. PM2 (process manager) ─────────────────────────────
log "Installing PM2..."
sudo npm install -g pm2
pm2 startup systemd -u $USER --hp $HOME | tail -1 | sudo bash -

# ── 4. Clone repository ───────────────────────────────────
log "Cloning AgentDesk..."
cd /opt
sudo mkdir -p agentdesk
sudo chown $USER:$USER agentdesk

# Replace with your actual GitHub URL
REPO_URL="${AGENTDESK_REPO:-https://github.com/YOUR_USERNAME/agentdesk.git}"
git clone "$REPO_URL" agentdesk
cd agentdesk

# ── 5. Install dependencies ───────────────────────────────
log "Installing API dependencies..."
cd apps/api
npm install
cd ../..

log "Installing web dependencies..."
cd apps/web
npm install
cd ../..

# ── 6. Environment setup ──────────────────────────────────
log "Setting up environment..."
if [ ! -f apps/api/.env ]; then
  cp apps/api/.env.example apps/api/.env
  warn "Created apps/api/.env from example — EDIT IT before starting!"
  warn "Run: nano /opt/agentdesk/apps/api/.env"
fi

# ── 7. Build frontend ─────────────────────────────────────
log "Building frontend..."
cd apps/web
npm run build
cd ../..

# ── 8. Build API ──────────────────────────────────────────
log "Building API..."
cd apps/api
npm run build 2>/dev/null || warn "TypeScript build skipped (using ts-node)"
cd ../..

# ── 9. Run database migrations ────────────────────────────
if grep -q "DATABASE_URL=postgresql" apps/api/.env 2>/dev/null; then
  log "Running database migrations..."
  cd apps/api
  npx ts-node src/database/migrate.ts && log "Migrations complete" || warn "Migration failed — check DATABASE_URL"
  cd ../..
else
  warn "DATABASE_URL not set — skipping migrations. Set it in .env and run: npm run migrate --prefix apps/api"
fi

# ── 10. Configure Nginx ───────────────────────────────────
log "Configuring Nginx..."
DOMAIN="${AGENTDESK_DOMAIN:-_}"
sudo tee /etc/nginx/sites-available/agentdesk > /dev/null <<EOF
server {
    listen 80;
    server_name $DOMAIN;

    # Frontend (serve built React app)
    root /opt/agentdesk/apps/web/dist;
    index index.html;

    # API proxy
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 120s;
        proxy_connect_timeout 10s;
    }

    # React Router — serve index.html for all non-API routes
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Security headers
    add_header X-Frame-Options SAMEORIGIN;
    add_header X-Content-Type-Options nosniff;
    add_header Referrer-Policy strict-origin-when-cross-origin;

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
}
EOF

sudo ln -sf /etc/nginx/sites-available/agentdesk /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl restart nginx
log "Nginx configured"

# ── 11. PM2 process ───────────────────────────────────────
log "Starting API with PM2..."
cat > /opt/agentdesk/ecosystem.config.js <<'PMEOF'
module.exports = {
  apps: [{
    name: 'agentdesk-api',
    script: 'npx',
    args: 'ts-node-dev --respawn --transpile-only src/index.ts',
    cwd: '/opt/agentdesk/apps/api',
    env: {
      NODE_ENV: 'production',
    },
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    error_file: '/opt/agentdesk/logs/api-error.log',
    out_file: '/opt/agentdesk/logs/api-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }]
};
PMEOF

mkdir -p /opt/agentdesk/logs
cd /opt/agentdesk
pm2 start ecosystem.config.js
pm2 save
log "API started with PM2"

# ── 12. Firewall ──────────────────────────────────────────
log "Configuring firewall..."
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS
sudo ufw --force enable
log "Firewall configured"

# ── Done ──────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     AgentDesk VM Setup Complete!             ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Frontend: ${GREEN}http://$(curl -s ifconfig.me)${NC}"
echo -e "  API:      ${GREEN}http://$(curl -s ifconfig.me)/api/health${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo -e "  1. Edit your .env:  nano /opt/agentdesk/apps/api/.env"
echo -e "  2. Restart API:     pm2 restart agentdesk-api"
echo -e "  3. View logs:       pm2 logs agentdesk-api"
echo -e "  4. HTTPS setup:     sudo certbot --nginx -d your-domain.com"
echo ""
