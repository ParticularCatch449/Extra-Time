# Deploying Extra Time to highlights.tvflix.co.uk

Step-by-step guide for self-hosting the Stremio addon and web viewer on your server.

**Security:** Do not commit passwords, SSH keys, or API tokens to the repository. Do not paste server passwords into chat or issue trackers — use SSH keys instead.

---

## What you need

| Item | Notes |
|------|--------|
| Server | Linux VPS or dedicated box with a public IP |
| Domain | `highlights.tvflix.co.uk` DNS A record → server IP |
| SSH access | Key-based login (recommended) |
| Node.js 18+ | Or Docker |
| Reverse proxy | nginx or Caddy for HTTPS |

After deployment:

- **Web viewer:** `https://highlights.tvflix.co.uk/`
- **Stremio manifest:** `https://highlights.tvflix.co.uk/manifest.json`

---

## 1. Provide SSH access securely

When working with an agent or collaborator, share access **without passwords in chat**:

### Recommended: SSH key

On your **local machine** (if you do not already have a key):

```bash
ssh-keygen -t ed25519 -C "extra-time-deploy" -f ~/.ssh/extra-time-deploy
```

Copy the **public** key to the server (you will be prompted for your password once):

```bash
ssh-copy-id -i ~/.ssh/extra-time-deploy.pub YOUR_USER@YOUR_SERVER_HOST
```

Test key login:

```bash
ssh -i ~/.ssh/extra-time-deploy YOUR_USER@YOUR_SERVER_HOST
```

Share with your deployer only:

- Hostname or IP (e.g. `highlights.tvflix.co.uk` or `203.0.113.10`)
- SSH username (e.g. `deploy` or `ubuntu`)
- **Private key file** via a secure channel (1Password, encrypted file, etc.) — never in git or plain chat

### Alternative: temporary deploy user

```bash
# On the server (as root or sudo user)
sudo adduser deploy
sudo mkdir -p /home/deploy/.ssh
sudo chmod 700 /home/deploy/.ssh
# Paste their public key into:
sudo nano /home/deploy/.ssh/authorized_keys
sudo chmod 600 /home/deploy/.ssh/authorized_keys
sudo chown -R deploy:deploy /home/deploy/.ssh
```

Revoke access later by removing their key from `authorized_keys`.

### Do not

- Paste root/password login details into Cursor chat or GitHub
- Store credentials in `.env` files committed to the repo
- Enable password-only SSH on production long-term

---

## 2. DNS

At your DNS provider for `tvflix.co.uk`:

| Type | Name | Value |
|------|------|--------|
| A | highlights | `YOUR_SERVER_IP` |

Wait for propagation, then verify:

```bash
dig +short highlights.tvflix.co.uk
```

---

## 3. Install the application

```bash
sudo mkdir -p /opt/extra-time
sudo chown "$USER":"$USER" /opt/extra-time
cd /opt/extra-time
git clone https://github.com/ParticularCatch449/Extra-Time.git .
```

Install dependencies (pick one):

```bash
# npm
npm ci --omit=dev

# or pnpm
corepack enable && pnpm install --frozen-lockfile
```

Set production URL (used for Stremio manifest links in the web UI):

```bash
export PUBLIC_URL=https://highlights.tvflix.co.uk
export PORT=7000
export NODE_ENV=production
```

Smoke test:

```bash
node server.js
# In another terminal on the server:
curl -sS http://127.0.0.1:7000/manifest.json | head
curl -sS http://127.0.0.1:7000/api/highlights | head
curl -sS -o /dev/null -w "%{http_code}" http://127.0.0.1:7000/
```

Stop the test process (Ctrl+C) and continue to systemd.

---

## 4. systemd service

```bash
sudo cp deploy/extra-time.service /etc/systemd/system/
```

Edit the unit if needed (`User`, `WorkingDirectory`, Node path):

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now extra-time
sudo systemctl status extra-time
journalctl -u extra-time -f
```

Optional: add `Environment=PUBLIC_URL=https://highlights.tvflix.co.uk` under `[Service]` in the unit file.

---

## 5. HTTPS reverse proxy

The app listens on **127.0.0.1:7000** only. nginx/Caddy terminates TLS and proxies **all paths** (`/`, `/watch`, `/api/*`, `/manifest.json`, etc.) to Node.

### nginx

```bash
sudo cp deploy/nginx-highlights.conf /etc/nginx/sites-available/highlights.tvflix.co.uk
sudo ln -sf /etc/nginx/sites-available/highlights.tvflix.co.uk /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d highlights.tvflix.co.uk
```

The sample config sets `X-Forwarded-Proto` so Express trusts HTTPS behind the proxy.

### Caddy

```bash
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Caddy obtains certificates automatically.

---

## 6. Docker (optional)

```bash
docker compose up -d --build
```

Ensure the reverse proxy still targets `127.0.0.1:7000`.

---

## 7. Verify production

```bash
curl -sS https://highlights.tvflix.co.uk/manifest.json | head
curl -sS https://highlights.tvflix.co.uk/api/config
```

In a browser:

1. Open `https://highlights.tvflix.co.uk/` — highlights grid loads
2. Click a match — YouTube player plays
3. Use **Install on Stremio** — copy manifest or open deep link

In Stremio: **Add-ons** → paste:

```
https://highlights.tvflix.co.uk/manifest.json
```

---

## 8. Updates

```bash
cd /opt/extra-time
git pull
npm ci --omit=dev   # or pnpm install --frozen-lockfile
sudo systemctl restart extra-time
```

---

## Troubleshooting

| Symptom | Check |
|---------|--------|
| 502 Bad Gateway | `systemctl status extra-time`, port 7000 listening |
| Manifest works, `/` 404 | `public/` deployed; restart after `git pull` |
| Wrong Stremio URL in UI | Set `PUBLIC_URL=https://highlights.tvflix.co.uk` |
| Stream never loads | Scorebat/YouTube embed chain; try another clip |
| CORS errors | Addon router includes CORS; API uses `/api` prefix |

---

## Firewall

Allow SSH (22), HTTP (80), HTTPS (443). Do **not** expose port 7000 publicly if nginx/Caddy fronts the app.

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'   # or 80,443
sudo ufw enable
```
