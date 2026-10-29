# Oracle Cloud Always-Free VM — Setup Guide for AgentDesk

Oracle Cloud's Always Free tier gives you a genuinely permanent free VM:
- **4 ARM OCPUs** (Ampere A1)
- **24 GB RAM**
- **200 GB storage**
- **10 TB outbound bandwidth/month**

---

## Step 1 — Create Oracle Cloud account

1. Go to [cloud.oracle.com](https://cloud.oracle.com) → **Start for free**
2. Fill in your details — you need a credit card but **you won't be charged** (it's just for identity verification)
3. Select your home region — choose the one closest to you (can't change later)
4. Complete email verification

---

## Step 2 — Create the VM

1. In the Oracle Cloud Console, go to **Compute → Instances → Create Instance**
2. **Name**: `agentdesk`
3. **Image**: Ubuntu 22.04 (click "Change Image" if it shows something else)
4. **Shape**: Click "Change Shape"
   - Select **Ampere** (ARM)
   - Select **VM.Standard.A1.Flex**
   - Set **OCPUs: 4** and **Memory: 24 GB**
   - (These are within the always-free limits)
5. **Networking**: Keep defaults (creates a new VCN automatically)
6. **SSH Keys**: 
   - Click "Generate a key pair for me"
   - Download both the private and public key files
   - Save the `.key` file — you need it to SSH in
7. Click **Create**

Wait ~2 minutes for the instance to start.

---

## Step 3 — Open firewall ports

By default Oracle Cloud blocks all ports. You need to open 80 and 443.

1. Go to **Networking → Virtual Cloud Networks**
2. Click your VCN → **Subnets** → your subnet → **Security Lists**
3. Click **Add Ingress Rules** and add:
   - Source: `0.0.0.0/0`, Protocol: TCP, Port: `80`
   - Source: `0.0.0.0/0`, Protocol: TCP, Port: `443`
4. Also open port 3001 temporarily for testing:
   - Source: `0.0.0.0/0`, Protocol: TCP, Port: `3001`

---

## Step 4 — Connect via SSH

Find your VM's **Public IP** in the instance details.

**From Windows (PowerShell):**
```powershell
# Set correct permissions on the key file
icacls "C:\path\to\your-key.key" /inheritance:r /grant:r "%USERNAME%:R"

# SSH into the VM
ssh -i "C:\path\to\your-key.key" ubuntu@YOUR_VM_IP
```

**From Mac/Linux:**
```bash
chmod 400 ~/Downloads/your-key.key
ssh -i ~/Downloads/your-key.key ubuntu@YOUR_VM_IP
```

---

## Step 5 — Run the setup script

Once you're SSHed into the VM:

```bash
# Download and run the setup script
# Replace YOUR_USERNAME with your GitHub username
export AGENTDESK_REPO="https://github.com/YOUR_USERNAME/agentdesk.git"
curl -fsSL https://raw.githubusercontent.com/YOUR_USERNAME/agentdesk/master/deploy/setup-vm.sh | bash
```

OR copy the script manually:
```bash
# Copy setup-vm.sh to the VM
scp -i your-key.key deploy/setup-vm.sh ubuntu@YOUR_VM_IP:/tmp/
ssh -i your-key.key ubuntu@YOUR_VM_IP
bash /tmp/setup-vm.sh
```

---

## Step 6 — Configure environment variables

```bash
nano /opt/agentdesk/apps/api/.env
```

Fill in your values:
```
GROQ_API_KEY=gsk_...
GROQ_MODEL=openai/gpt-oss-120b
DATABASE_URL=postgresql://...
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
JWT_SECRET=your-long-random-secret
FRONTEND_URL=http://YOUR_VM_IP
APP_URL=http://YOUR_VM_IP
PORT=3001
NODE_ENV=production
```

Then restart:
```bash
pm2 restart agentdesk-api
pm2 logs agentdesk-api
```

---

## Step 7 — Access your deployment

- **App**: `http://YOUR_VM_IP`
- **API health**: `http://YOUR_VM_IP/api/health`

---

## Step 8 (Optional) — Set up a free domain + HTTPS

1. Get a free domain at [freenom.com](https://freenom.com) or [duckdns.org](https://duckdns.org)
2. Point it to your VM's IP
3. Get free HTTPS:

```bash
sudo certbot --nginx -d yourdomain.com
```

Certbot auto-renews. Your app will be at `https://yourdomain.com`.

---

## Useful commands on the VM

```bash
# Check API status
pm2 status

# View live logs
pm2 logs agentdesk-api

# Restart API
pm2 restart agentdesk-api

# Update to latest code
cd /opt/agentdesk && bash deploy/update.sh

# Check nginx
sudo nginx -t
sudo systemctl status nginx

# Check disk space
df -h

# Check memory
free -h

# Check CPU
htop
```

---

## Troubleshooting

**API not starting?**
```bash
pm2 logs agentdesk-api --lines 50
```

**Nginx 502 Bad Gateway?**
```bash
# Check if API is running on port 3001
curl http://localhost:3001/api/health
pm2 status
```

**Can't connect from browser?**
- Check Oracle Cloud Security List has port 80 open
- Check ufw: `sudo ufw status`

**Database connection fails?**
```bash
# Test from VM
cd /opt/agentdesk/apps/api
node -e "require('./dist/database/pool').healthCheck().then(console.log)"
```
