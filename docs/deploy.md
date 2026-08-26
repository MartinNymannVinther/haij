# Deploying Haij

Target: a single EU VPS (Hetzner initially — the provider must stay
replaceable) running [Coolify](https://coolify.io), deploying
`docker-compose.yml` from this repository. Everything runs in Docker; moving
to another EU provider means restoring one Postgres dump on another box.

## 1. Server

- Create a VPS in an EU region (e.g. Hetzner Falkenstein/Nuremberg or
  Helsinki). 2 vCPU / 4 GB RAM is plenty to start.
- Point DNS for your app hostname (e.g. `app.haij.dk`) at the server.
- Install Coolify (their one-line installer) and log in.

## 2. Create the application

1. In Coolify: **New resource → Docker Compose**, connect this Git
   repository, branch `main`. Coolify picks up `docker-compose.yml`.
2. Set the environment variables (Coolify → Environment Variables):

   | Variable             | Value                                                            |
   | -------------------- | ---------------------------------------------------------------- |
   | `POSTGRES_PASSWORD`  | `openssl rand -base64 24`                                        |
   | `HAIJ_APP_PASSWORD`  | `openssl rand -base64 24`                                        |
   | `HAIJ_AUTH_PASSWORD` | `openssl rand -base64 24`                                        |
   | `BETTER_AUTH_SECRET` | `openssl rand -base64 32`                                        |
   | `BETTER_AUTH_URL`    | `https://app.haij.dk` (public URL; passkeys bind to this origin) |

3. Attach the domain to the `app` service and let Coolify provision TLS.
   Health check path: `/api/health`.
4. Deploy. The compose order is enforced: `db` becomes healthy → `migrate`
   runs all Drizzle migrations (as the Postgres superuser, which the
   SECURITY DEFINER audit trigger relies on) → `app` starts. The
   `docker/postgres-init` script creates the two runtime roles on first boot.

## 3. Verify

```bash
curl https://app.haij.dk/api/health   # {"status":"ok"}
```

Register a user, confirm the Danish dashboard, add a passkey, log out and
back in with it.

## 4. Nightly encrypted backups (EU object storage)

Per the project constitution: nightly encrypted dumps to EU-owned object
storage (e.g. Hetzner Object Storage or a Storage Box). On the VPS:

```bash
# /root/backup-haij.sh  (chmod 700; requires age + rclone with an EU remote)
#!/usr/bin/env bash
set -euo pipefail
STAMP=$(date +%F)
docker exec $(docker ps -qf name=db) pg_dump -U postgres -Fc haij \
  | age -r "$(cat /root/haij-backup.pub)" \
  > "/root/backups/haij-$STAMP.dump.age"
rclone copy "/root/backups/haij-$STAMP.dump.age" eu-storage:haij-backups/
find /root/backups -mtime +14 -delete
```

```
# crontab -e
15 2 * * * /root/backup-haij.sh
```

Keep the age private key offline (password manager), not on the server.
Test a restore at least quarterly:

```bash
age -d -i haij-backup.key haij-2026-01-01.dump.age | pg_restore -d haij_restore
```

Any new storage or email provider goes into `docs/subprocessors.md` first.

## 5. Updating

Push to `main` → Coolify redeploys. The `migrate` service runs before the
new app container starts, so migrations are always applied first. Keep
migrations backwards compatible with the previous app version (expand →
migrate → contract) once real users are on the platform.

## 6. Moving provider (exit plan)

1. Provision a VPS at the new EU provider, install Coolify, connect the repo.
2. Set the same environment variables.
3. Restore the latest dump into the new `db` service.
4. Flip DNS. Everything is Docker + Postgres; nothing is provider-specific.
