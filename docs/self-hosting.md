# Self-hosting

Hearthside runs as three containers: the web app, a background worker and Postgres.
Images build natively on the host, including ARM64 machines.

```sh
mkdir -p secrets && openssl rand -base64 32 > secrets/db_password.txt
docker compose up -d --build
```

- The web app is published on `127.0.0.1:3000` only. Put a tunnel or reverse proxy on the
  host in front of it; see `deploy/tunnel/config.example.yml`.
- The database sits on an internal network. The worker cannot reach it.
- The database password is a Compose secret, never an environment variable.
- `web` and `worker` run read-only, as a non-root user, with all capabilities dropped.
- Logs are JSON with rotation (10 MB × 5 per container): `docker compose logs -f`.
- Health: `curl -s localhost:3000/api/health`.

Upgrade with `git pull && docker compose up -d --build`.
