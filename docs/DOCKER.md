# Running Aswaqi with Docker

The image contains only Node.js 24 and the pre-built app — no npm packages at runtime. It runs as the unprivileged `node` user on a read-only filesystem; the only writable places are two volumes:

| Volume | Path in container | Contents |
|---|---|---|
| `aswaqi_data` | `/app/data` | The SQLite database (accounts, sessions, store data) |
| `aswaqi_backups` | `/app/backups` | Automatic and manual snapshots |

Both survive `docker compose down`, image updates and container replacement. **`docker compose down -v` deletes them.**

## 1. First start

```bash
git clone https://github.com/engnoordesign/aswaqi.git && cd aswaqi
cp .env.docker.example .env      # then edit APP_URL and friends
docker compose build
docker compose up -d
```

Open `APP_URL`: the first visit shows a **Set up your store** screen where you choose the manager's username and password. (Terminal alternative, before the first visit: `docker compose run --rm aswaqi node scripts/create-owner.js --username admin`.)

**No terminal available** (Portainer, Coolify, a remote panel)? Let the container create the first manager on its first start, from a Docker secret:

```bash
mkdir -p secrets && printf '%s' 'a-long-password-here' > secrets/owner_password
sudo chown 1000:1000 secrets/owner_password && chmod 600 secrets/owner_password
# in .env: OWNER_USERNAME=admin
docker compose -f compose.yaml -f compose.secrets.yaml up -d
docker compose logs aswaqi        # "First manager created for ..."
rm secrets/owner_password         # then use plain `docker compose up -d` from now on
```

Bootstrap only runs while the database is empty, so leaving `OWNER_USERNAME` set is harmless. `OWNER_PASSWORD=...` also works for throwaway test containers, but it stays visible in `docker inspect`, so prefer the secret file.

## 2. Choose how people reach it

The browser address must match `APP_URL` (or one of `ALLOWED_ORIGINS`), otherwise login is refused with *Origin not allowed*.

**A. Shop network only (simplest).** Every till/phone on the same Wi-Fi uses the server's LAN address.

```ini
BIND_ADDRESS=0.0.0.0
APP_URL=http://192.168.1.20:3000
ALLOWED_ORIGINS=http://localhost:3000
```

Give the server a fixed IP in the router. Traffic is plain HTTP, so keep this to a private network you trust.

**B. Internet with automatic HTTPS (Caddy profile).** Point a domain's DNS at the server, open ports 80 and 443, then:

```ini
DOMAIN=shop.example.com
APP_URL=https://shop.example.com
TRUST_PROXY=true
BIND_ADDRESS=127.0.0.1
```

```bash
docker compose --profile https up -d
```

Caddy fetches and renews the certificate itself and forwards to the app over the internal Docker network.

**C. Your own Nginx on the host.** Keep `BIND_ADDRESS=127.0.0.1`, set `TRUST_PROXY=true`, and start from `docs/nginx.conf.example`.

Only enable `TRUST_PROXY` when the app port is *not* reachable directly; otherwise a client could fake `X-Forwarded-For` to dodge the login rate limit.

## 3. Day-to-day commands

```bash
docker compose ps                         # status + health
docker compose logs -f aswaqi             # live logs (rotated at 3 × 10 MB)
docker compose exec aswaqi node scripts/backup.js
docker compose exec aswaqi node scripts/reset-password.js --username admin
```

Scripted password reset without a TTY:

```bash
printf '%s\n' 'new-long-password' | docker compose exec -T aswaqi \
  node scripts/reset-password.js --username admin --password-stdin
```

## 4. Backups

With the default `.env`, the server writes a snapshot every 24 hours and keeps the newest 14 (`BACKUP_INTERVAL_HOURS`, `BACKUP_KEEP`; `0` disables). They are consistent `VACUUM INTO` copies, safe to take while the shop is selling.

Snapshots inside a Docker volume are lost with the disk. Copy them off the machine regularly:

```bash
docker compose cp aswaqi:/app/backups ./aswaqi-backups-$(date +%F)
```

### Restore

```bash
docker compose exec aswaqi node -e "require('fs').readdirSync('/app/backups').forEach(f=>console.log(f))"
docker compose stop aswaqi
docker compose run --rm --no-deps aswaqi node scripts/restore.js --from /app/backups/aswaqi-<time>.sqlite
docker compose start aswaqi
```

The script checks the snapshot's integrity, asks you to type `RESTORE`, and moves the current database to `/app/data/pre-restore-<time>/` instead of deleting it. Passwords revert to what they were when the snapshot was taken.

To restore a snapshot from outside the server, copy it in first: `docker compose cp ./file.sqlite aswaqi:/app/backups/`.

## 5. Updating

**Building on the server:**

```bash
git pull
docker compose up -d --build
docker compose ps        # wait for "healthy"
```

**Using the image published by GitHub Actions** (built only when you push a `v*` tag or run the workflow manually from the Actions tab — a manual run on `main` updates `latest`): the package is private, so log in once with a GitHub token that has `read:packages`:

```bash
echo "$TOKEN" | docker login ghcr.io -u engnoordesign --password-stdin
# in .env: ASWAQI_IMAGE=ghcr.io/engnoordesign/aswaqi:latest
docker compose pull && docker compose up -d
```

Tags: `latest` (main), `sha-<commit>` (every build), and `1.2.3` for `v1.2.3` git tags. Pin a `sha-` or version tag if you want rollbacks to be one line.

## 6. Settings reference

| Variable | Default | Purpose |
|---|---|---|
| `APP_URL` | `http://localhost:3000` | Exact public URL. `https://` turns on Secure cookies and HSTS. |
| `ALLOWED_ORIGINS` | — | Extra URLs allowed to log in, comma-separated. |
| `BIND_ADDRESS` | `127.0.0.1` | Host interface for the published port (`0.0.0.0` for LAN). |
| `PORT` | `3000` | Host port. The container always listens on 3000. |
| `TRUST_PROXY` | `false` | Use the proxy's `X-Forwarded-For` for per-client rate limits. |
| `SESSION_HOURS` | `12` | Login session length (max 168). |
| `BACKUP_INTERVAL_HOURS` | `24` | Automatic snapshot interval; `0` disables. |
| `BACKUP_KEEP` | `14` | Snapshots kept by automatic and `--keep` backups. |
| `OWNER_USERNAME` / `OWNER_PASSWORD_FILE` | — | Unattended first-run manager creation (otherwise use the setup screen). |
| `DOMAIN` | — | Hostname for the `https` profile. |
| `ASWAQI_IMAGE` | `aswaqi:local` | Image to run (e.g. the GHCR image). |

## Troubleshooting

- **Origin not allowed** — the address in the browser is not `APP_URL`/`ALLOWED_ORIGINS`. Match scheme, host *and* port, then `docker compose up -d`.
- **Container restarting, log says `EACCES` on `/run/secrets/owner_password`** — the secret file must be owned by uid 1000 (`sudo chown 1000:1000 secrets/owner_password`).
- **Bind-mounting a host folder instead of a volume** — the folder must be writable by uid 1000: `sudo chown -R 1000:1000 ./data`.
- **Unhealthy** — `docker compose logs aswaqi`; the health probe checks both HTTP and the database.
- **Build the test stage** — `docker build --target test .` runs type-check, build and the full test suite inside the image.
