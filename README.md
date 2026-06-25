# Extra Time [Stremio](https://www.stremio.com/) Addon

Watch goals and highlights from the latest football matches from around the world.

Highlights are aggregated from **ScoreBat** (free public feeds) and official league **YouTube** channels (RSS, no API key required). YouTube-sourced videos resolve directly without browser scraping. Optional `YOUTUBE_API_KEY` enables `scripts/youtube-backfill.js` for deeper historical pagination.

Based on [jamesalester/Extra-Time](https://github.com/jamesalester/Extra-Time). This copy is maintained at [ParticularCatch449/Extra-Time](https://github.com/ParticularCatch449/Extra-Time).

![Extra Time Preview](./preview.png)

## Installation

### In Stremio

Search for **Extra Time** in Stremio’s add-on catalog if it is listed there. Otherwise use one of the options below.

### Add from URL (hosted)

Paste this URL into Stremio’s add-on search field:

```
https://highlights.tvflix.co.uk/manifest.json
```

The legacy `https://extra-time.now.sh/manifest.json` deployment is no longer available.

### Run locally

Install [Node.js](https://nodejs.org/) 18+, then run:

```bash
git clone https://github.com/ParticularCatch449/Extra-Time.git
cd Extra-Time
pnpm install
pnpm start
```

By default the addon listens on port **7000**. In Stremio’s add-on search field, use:

```
http://127.0.0.1:7000/manifest.json
```

Use a different port with `PORT=62380 pnpm start` if you prefer.

### Web viewer (browser)

With the server running locally, open:

```
http://127.0.0.1:7000/
```

Browse highlights, watch in the embedded player, or use **Install on Stremio** to copy the manifest URL / open the Stremio deep link.

Set `PUBLIC_URL` when deploying so install links point at your domain, e.g. `PUBLIC_URL=https://highlights.tvflix.co.uk node server.js`.

## Deployment (self-host on highlights.tvflix.co.uk)

Production URLs:

| Service | URL |
|---------|-----|
| Web viewer | `https://highlights.tvflix.co.uk/` |
| Stremio manifest | `https://highlights.tvflix.co.uk/manifest.json` |

Full step-by-step server setup (SSH, DNS, systemd, HTTPS): **[DEPLOY.md](./DEPLOY.md)**.

### 1. DNS

Point the subdomain at your server (replace `YOUR_SERVER_IP`):

| Type | Name        | Value            |
|------|-------------|------------------|
| A    | highlights  | YOUR_SERVER_IP   |

(`highlights` is the host under `tvflix.co.uk`.)

### 2. Application on the server

```bash
sudo mkdir -p /opt/extra-time
sudo chown "$USER":"$USER" /opt/extra-time
cd /opt/extra-time
git clone https://github.com/ParticularCatch449/Extra-Time.git .
pnpm install
PORT=7000 pnpm start:prod
```

For a persistent service, use the example unit in [`deploy/extra-time.service`](./deploy/extra-time.service):

```bash
sudo cp deploy/extra-time.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now extra-time
```

Verify locally on the server:

```bash
curl -sS http://127.0.0.1:7000/manifest.json | head
```

### 3. HTTPS reverse proxy

**nginx** — see [`deploy/nginx-highlights.conf`](./deploy/nginx-highlights.conf), then:

```bash
sudo cp deploy/nginx-highlights.conf /etc/nginx/sites-available/highlights.tvflix.co.uk
sudo ln -sf /etc/nginx/sites-available/highlights.tvflix.co.uk /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d highlights.tvflix.co.uk
```

**Caddy** — see [`deploy/Caddyfile`](./deploy/Caddyfile) (automatic HTTPS).

**Docker** (optional) — bind only on localhost so nginx/Caddy can front it:

```bash
docker compose up -d --build
```

### 4. Install in Stremio

After `https://highlights.tvflix.co.uk/manifest.json` returns JSON in a browser, add that URL in Stremio → Add-ons.

---

## Appendix: deploy on Vercel (optional)

This repo includes [`vercel.json`](./vercel.json) and [`api/index.js`](./api/index.js) for serverless hosting if you do not use your own server. Vercel is **not** required for `highlights.tvflix.co.uk`.

1. Import [ParticularCatch449/Extra-Time](https://github.com/ParticularCatch449/Extra-Time) in the [Vercel dashboard](https://vercel.com/new).
2. Use `pnpm install` with no build command; rewrites send traffic to `api/index.js` → `serverless.js`.
3. Install in Stremio with `https://<your-project>.vercel.app/manifest.json`.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FParticularCatch449%2FExtra-Time&project-name=extra-time&demo-description=Stremio%20addon%20for%20football%20highlights&demo-title=Extra%20Time)

## License

MIT — see [LICENSE](./LICENSE). Original work Copyright (c) James A Lester.
