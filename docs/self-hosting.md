# Self-hosting

Hearthside runs as four containers: the web app, a background worker, a local model service
(`decide`) and Postgres.
Images build natively on the host, including ARM64 machines.

```sh
mkdir -p secrets
[ -f secrets/db_password.txt ] || openssl rand -base64 32 > secrets/db_password.txt
[ -f secrets/encryption_key.txt ] || (umask 077 && openssl rand -base64 32 > secrets/encryption_key.txt)
pnpm stack       # or: GIT_SHA=$(git rev-parse --short HEAD) docker compose up -d --build
```

- The web app is published on `127.0.0.1:3300` only (set `WEB_PORT` to change it; 3300
  avoids clashing with other local apps on 3000). Put a tunnel or reverse proxy on the
  host in front of it; see `deploy/tunnel/config.example.yml`.
- To test from a phone on the same network, put `WEB_BIND=0.0.0.0` in `.env` and browse to
  the host's LAN address on that port.
- The database sits on an internal network. The worker cannot reach it.
- The database password is a Compose secret, never an environment variable.
- Private fields are encrypted in the database with a master key from
  `secrets/encryption_key.txt`. **Back that file up offline, apart from the database
  backups.** Without it the data can't be read. See [Encryption](encryption.md) for rotation.
- `web`, `worker` and `decide` run read-only, as a non-root user, with all capabilities dropped.
- Logs are JSON with rotation (10 MB × 5 per container): `docker compose logs -f`.
- Health: `curl -s localhost:3300/api/health`.

## Signing in

Sign-in uses passkeys, which browsers only allow on HTTPS or `localhost`. Set `APP_ORIGIN`
in `.env` to the exact address people use, for example `APP_ORIGIN=https://home.example.com`.
It defaults to `http://localhost:3300`. A LAN address like `http://192.168.1.20:3300` will
load the app but cannot sign in, so phones need the HTTPS address.

The first visit opens `/setup`, which creates the home and its owner. After that, setup is
closed and new members join with an invite link from Settings. Each member gets 10 single-use
recovery codes for when they lose every device with their passkey.

Upgrade with `git pull && pnpm stack`.

## Automatic categories

Entries are filed in this order, and the first answer wins:

1. "Always use this" rules
2. The category people picked before for the same description
3. A built-in keyword list
4. A local model ([Laya](https://github.com/receptron/laya), run with ONNX Runtime on CPU),
   kept only when it is at least 60% sure

Households can add up to 16 categories of their own in Settings, each with keywords; the
keyword step and the model use them too. Steps 1 to 3 run during import. The model fills in the rest in the background, and people's
own choices are never overwritten. The Transactions screen has a "Categorize now" button.

The model runs in the `decide` container, which has no database access and sits on an
internal network with no way out. The model files (about 1.7 GB) are downloaded once by the
one-shot `decide-fetch` container into the `models` volume. Only published model files are
downloaded, and nothing is sent. The first `pnpm stack` therefore takes a while. Loaded, the
model uses about 2 GB of memory (`MODEL_MEMORY` caps it, default `3g`; `MODEL_THREADS`,
default 2, sets CPU threads).

To run without the model: `docker compose up -d --scale decide=0`. Entries the rules and
keywords can't place then stay uncategorized and get filed once the model is back.

## Changing the database password

Postgres only reads `secrets/db_password.txt` when it creates the database volume. Rewriting
the file later does not change the password inside the database, so the web app can no longer
connect. To rotate it, set the new password in the database first, then update the file:

```sh
docker compose exec db psql -U hearthside -d hearthside \
  -c "ALTER USER hearthside PASSWORD '<new password>'"
printf '%s' '<new password>' > secrets/db_password.txt
```

The web app picks up the new password on its next health check; no restart is needed.
(`docker compose down -v` also works, but it deletes all data.)
