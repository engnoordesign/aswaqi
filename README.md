# Aswaqi | أسواقي

Standalone bilingual supermarket management: React frontend, Node.js `server.js`, SQLite persistence, server-enforced staff permissions and connected inventory/accounting.

This is a separate self-hosted repository. It does not require ChatGPT, Cloudflare, Sites or an external database service. It starts with an empty store; data from the hosted version is not copied. The frontend production build is included, so the basic server needs **no npm runtime packages**.

## Run it on your computer (local, no internet needed)

1. Install **Node.js 24 or newer** from [nodejs.org](https://nodejs.org).
2. Download this repository (green **Code** button → **Download ZIP**) and unzip it.
3. Start Aswaqi:
   - **Windows:** double-click **`start.bat`**.
   - **macOS / Linux:** run `sh start.sh` in a terminal (or `npm start`).
4. Your browser opens **http://localhost:3000**. The first time, a **Set up your store** screen appears: choose the manager's **username** and **password** (12+ characters). You're signed in straight away.
5. Add staff under **Team & access** — each person gets their own username and password.

Keep the start window open while you use Aswaqi; close it (or press Ctrl+C) to stop. Nothing is installed with npm and no `.env` file is needed. Your data stays on this computer in `data/aswaqi.sqlite`, and a backup snapshot is written to `backups/` every 24 hours (14 kept).

By default only this computer can open Aswaqi. To let other tills or phones on the shop Wi-Fi use it, copy `.env.example` to `.env`, set `HOST=0.0.0.0` and add this computer's address, e.g. `ALLOWED_ORIGINS=http://192.168.1.20:3000`, then open that address on the other devices.

Prefer the terminal for the first account? `npm run owner:create -- --username admin` works too (before the first start in the browser).

## Rebuild or develop

```bash
npm ci
npm run typecheck
npm run build
npm test
npm start
```

For frontend development, set `NODE_ENV=development` in `.env`, run `npm start` in one terminal and `npm run dev` in another, then open **http://localhost:5173**. Vite proxies API calls to port 3000. The production build remains served on port 3000.

## First store setup

1. **Settings:** set store name, currency, tax and receipt text. Currency locks after the first accounting transaction.
2. **Products:** add Arabic/English names, unique barcodes, category, price, unit and minimum display quantity.
3. **Purchases:** receive a supplier batch into warehouse stock. Enter quantity, unit cost, optional expiry date, and cash or credit payment.
4. **Inventory:** move warehouse quantities to **On display** so they can be sold. Move damaged/expired quantities to **Expired** to post a write-off.
5. **Point of sale:** search or use a keyboard-mode barcode scanner; accept cash, externally processed card payment, or customer credit. Print a receipt.
6. **Accounting:** enter opening cash once, record expenses, and settle customer/supplier balances.
7. **Team & access:** create individual staff accounts with passwords of at least 12 characters. Each person signs in at the same server URL. The key icon in the top bar changes the signed-in user's password.

| Role | Access |
|---|---|
| Manager | All pages, settings, staff and reports |
| Cashier | Sales, whole cash/card-sale refunds, purchase receiving |
| Stock keeper | Product catalog, batches, warehouse/display/expired transfers |
| Accountant | Accounting, expenses, payments, opening cash and reports |

Pages poll every 15 seconds; saved changes update immediately. Concurrent submissions are revision-checked in a SQLite transaction. Stale writes are rejected instead of overwriting another user's work. Expired display batches are blocked from checkout. Sales use earliest-expiring batches first and post actual batch cost. Every journal is balanced.

## Docker (optional, for a server)

Not needed for local use. To run Aswaqi on a server instead, see the full guide: **[docs/DOCKER.md](docs/DOCKER.md)**.

```bash
cp .env.docker.example .env        # set APP_URL; BIND_ADDRESS=0.0.0.0 for shop-LAN access
docker compose build
docker compose up -d
docker compose ps                  # wait for "healthy", then open APP_URL and create the manager
```

What the container setup gives you:

- **Small, locked-down image** — Node 24 plus the pre-built app, no runtime npm packages; runs as a non-root user with a read-only filesystem, no Linux capabilities and `no-new-privileges`.
- **Health checks** that verify the database, not just the port; graceful shutdown with `init`.
- **Automatic backups** every 24 h into the `aswaqi_backups` volume, keeping 14 (configurable), plus a `restore.js` command.
- **Shop LAN or internet** — `BIND_ADDRESS`/`ALLOWED_ORIGINS` for tills on the local network, or `docker compose --profile https up -d` for Caddy with automatic HTTPS certificates.
- **Unattended first run** — create the first manager from a Docker secret (`compose.secrets.yaml`) when there is no terminal.
- **Rotated logs** (3 × 10 MB) so the disk doesn't fill up.
- **CI-built image (optional)** — every push to `main` runs the tests; the image is only built and published to the private `ghcr.io/engnoordesign/aswaqi` when you push a `v*` tag or run the workflow by hand.

Data lives in named volumes and survives rebuilds and container replacement. Do not run `docker compose down -v` unless you intend to delete everything.

## Backup and recovery

```bash
npm run backup
# Docker equivalent:
docker compose exec aswaqi node scripts/backup.js
```

`node scripts/backup.js --keep 14` also prunes older snapshots. Set `BACKUP_INTERVAL_HOURS` (and `BACKUP_KEEP`) to have the server take snapshots on a schedule; the Docker setup does this by default.

This creates a consistent full SQLite snapshot with accounts, password hashes, store records and sessions. Restrict access to backups. Copy snapshots to another machine or protected storage; local copies alone do not protect against disk loss. The app also offers JSON business-data export, which is not a full database restore format.

To restore a snapshot: stop the application, then run

```bash
npm run restore -- --from backups/aswaqi-<time>.sqlite
# Docker: see docs/DOCKER.md — docker compose stop aswaqi, then
docker compose run --rm --no-deps aswaqi node scripts/restore.js --from /app/backups/aswaqi-<time>.sqlite
```

The script checks the snapshot's integrity, asks for confirmation, and moves the current database and its `-wal`/`-shm` files into `data/pre-restore-<time>/` rather than deleting them. Passwords from the snapshot are restored too. Do not copy a live SQLite main file as a backup; use the backup command.

Reset a forgotten password (run in the Aswaqi folder on the computer that runs it):

```bash
npm run password:reset -- --username admin
# Docker equivalent:
docker compose exec aswaqi node scripts/reset-password.js --username admin
```

The password prompt is hidden. For scripts, pipe the password and add `--password-stdin` (also supported by `create-owner.js`). Resetting or changing a password revokes that account's active sessions. Removing a staff member revokes access immediately.

## Repository structure

```text
server.js                  HTTP server, authentication, API and static serving
backend/database.js        SQLite schema, transactions and state access
backend/security.js        Password hashing, session tokens and validation
frontend/App.tsx           Bilingual supermarket interface
frontend/main.tsx          First-run setup, login, logout and password-change screens
frontend/styles.css        Responsive styling and RTL support
shared/engine.ts            Typed business rules used by frontend and backend
shared/engine.js            Generated backend business rules
backend/backup.js          Snapshots, retention and scheduled backups
backend/owner.js           First-manager creation (browser setup, CLI and container bootstrap)
scripts/                   Owner setup, password recovery, backup/restore, health probe, build
tests/                    Business rules and HTTP integration tests
start.bat / start.sh       Double-click / one-command local start
dist/                     Included production frontend build
Dockerfile                 Multi-stage image: deps → build → test → runtime
compose.yaml               App service (+ optional Caddy HTTPS profile)
compose.secrets.yaml       Optional first-run manager from a Docker secret
deploy/Caddyfile           Reverse proxy config for the https profile
.env.docker.example        Docker settings template
docs/DOCKER.md             Docker deployment, backup/restore and update guide
.github/workflows/ci.yml   Tests on push; container build/publish only on tags or manual run
```

Edit `shared/engine.ts`, then run `npm run build` to regenerate `shared/engine.js` and the frontend. Include both source and generated output when committing releases. Never commit `.env`, the database, backups or real credentials.

## Repository

Private repository: `github.com/engnoordesign/aswaqi`. Clone with `git clone https://github.com/engnoordesign/aswaqi.git`. GitHub Actions runs the tests on every push. The container image is published to the private `ghcr.io/engnoordesign/aswaqi` package only for `v*` tags or a manual run.

## Scope and limitations

- One store and currency; the state is a revisioned SQLite JSON document. This suits an initial small-store deployment. Normalize records and add pagination before large transaction volumes; the server caps the state at 32 MiB.
- Requires online access to the server; no offline checkout queue.
- Card mode records a payment already taken on your card terminal. It does not charge a card.
- Refunds reverse complete cash/card sales; partial refunds, credit-sale refunds and supplier returns are not implemented.
- No direct scale/cash-drawer integration, barcode-label printer driver, fiscal invoice certification, multi-branch stock or automated bank reconciliation.
- Tax is configurable. Reports are operational bookkeeping, not jurisdiction-specific statutory financial statements.
- Demo inventory can only be loaded into an empty store; it creates real sample records. Use a separate test database for demos.
- Scheduled backups stay on the same machine; copying them elsewhere is up to you. The app's JSON export has no automatic import UI.
- Google Fonts are optional external requests; fallback fonts keep the interface usable without them.

## Verification

TypeScript checks, production frontend build and 13 tests pass: six business-engine tests, two server/security tests, two setup tests (browser first-run setup with username sign-in; migration of databases from the earlier email-based version) and three container tests (first-run bootstrap from a secret file, backup snapshot and pruning, database-aware health, extra allowed origins and proxy-aware rate limiting). The same suite runs inside `docker build --target test`.

The Docker image and Compose stack were run end to end: healthy status, read-only root filesystem and non-root user, login from `APP_URL` and an `ALLOWED_ORIGINS` LAN address (foreign origins rejected), store writes, manual backup, `--password-stdin` reset, data persisting through `docker compose down`/`up`, and restore from a snapshot. The authoring environment could not pull from Docker Hub, so that run used a locally assembled Node 24.21 base image in place of `node:24-bookworm-slim`; the GitHub Actions workflow repeats a smoke test against the official base image. The Caddy HTTPS profile needs a real domain and was not run. The local start (setup screen → manager created → staff sign-in with a username) was checked in a browser. The Docker run described above predates the username change.

See [Arabic setup guide](docs/README.ar.md).
