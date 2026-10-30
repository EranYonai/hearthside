# Self-hosting

Hearthside runs as three containers: the web app, a background worker and Postgres.
Images build natively on the host, including ARM64 machines.

```sh
mkdir -p secrets
[ -f secrets/db_password.txt ] || openssl rand -base64 32 > secrets/db_password.txt
docker compose up -d --build
```

- The web app is published on `127.0.0.1:3300` only (set `WEB_PORT` to change it; 3300
  avoids clashing with other local apps on 3000). Put a tunnel or reverse proxy on the
  host in front of it; see `deploy/tunnel/config.example.yml`.
- To test from a phone on the same network, put `WEB_BIND=0.0.0.0` in `.env` and browse to
  the host's LAN address on that port.
- The database sits on an internal network. The worker cannot reach it.
- The database password is a Compose secret, never an environment variable.
- `web` and `worker` run read-only, as a non-root user, with all capabilities dropped.
- Logs are JSON with rotation (10 MB × 5 per container): `docker compose logs -f`.
- Health: `curl -s localhost:3300/api/health`.

Upgrade with `git pull && docker compose up -d --build`.

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
