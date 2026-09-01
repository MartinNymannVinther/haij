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
   | `CVR_CONTACT`        | an email address; cvrapi.dk's terms require an identifying UA    |
   | `HAIJ_COMMIT`        | the deployed commit, short form (see below)                      |

   `SIGNUP` is deliberately absent: it defaults to `closed`, which is what
   an installation on the open internet should be. See section 5.

3. Build arguments (Coolify → Build): pass `HAIJ_COMMIT` and, if you like,
   `HAIJ_BUILT_AT`. `.dockerignore` excludes `.git`, so without them the
   About page and `/api/version` honestly report `unknown` rather than
   guessing. Coolify exposes the commit it is building; if it cannot be
   wired automatically, set it by hand at each release — it is one line and
   it is what makes "which version is running" answerable.
4. Attach the domain to the `app` service and let Coolify provision TLS.
   Health check path: `/api/health`.
5. Deploy. The compose order is enforced: `db` becomes healthy → `migrate`
   runs all Drizzle migrations (as the Postgres superuser, which the
   SECURITY DEFINER audit trigger relies on) → `app` starts. The
   `docker/postgres-init` script creates the two runtime roles on first boot.

## 3. Verify

```bash
curl https://app.haij.dk/api/health    # {"status":"ok"}
curl https://app.haij.dk/api/version   # the release you just deployed
```

Then log in and open **Indstillinger → Om**: version, commit and build time
should match what you deployed, and the schema card should say the database
has applied as many migrations as the code expects. If it says migrations
are pending, the `migrate` service did not run — fix that before using the
installation.

## 4. Bringing an existing database with you

Moving a working installation (or a local development database) onto the
server is a dump and a restore. On the machine that has the data:

```bash
pg_dump -Fc -U postgres haij > haij.dump
scp haij.dump root@your-server:/root/
```

On the server:

```bash
DB=$(docker ps -qf name=db | head -1)
docker cp /root/haij.dump "$DB":/tmp/haij.dump
# The roles are created by postgres-init; the dump carries the data.
docker exec "$DB" pg_restore -U postgres -d haij --clean --if-exists /tmp/haij.dump
docker exec "$DB" rm /tmp/haij.dump
```

Two things to expect afterwards:

- **Passkeys do not travel.** A passkey is bound to the origin it was
  created for, so one registered on `http://localhost:3000` will not work on
  `https://app.haij.dk`. Log in with your password and register a new
  passkey there. That is WebAuthn working as designed, not a bug.
- **Check the invoice counter.** `Indstillinger → Virksomhed` should still
  show the next invoice number you expect. Sequential numbering is a legal
  requirement, and a restore is the one moment it can silently go backwards.

## 5. Who can create an account

`SIGNUP` defaults to `closed`: once the installation has its first user,
registration is refused, at the endpoint and not merely in the interface.
The first account on an empty installation is let through, which is how you
get in at all.

So on a fresh installation, register immediately after the first deploy —
that first registration is the one that closes the door behind it. On an
installation restored from a dump the door is already closed, because the
users came with the data.

Setting `SIGNUP=open` re-opens registration for anyone who finds the
address. That is for a demo instance, not for a company's own Haij.

## 6. Nightly encrypted backups (EU object storage)

Per the project constitution: nightly encrypted dumps to EU-owned object
storage (e.g. Hetzner Object Storage or a Storage Box). The script lives in
this repository at `scripts/backup-haij.sh`. On the VPS:

```bash
# Generate the key pair on your own machine, not on the server.
age-keygen -o haij-backup.key            # keep this in your password manager
grep 'public key' haij-backup.key        # the public half goes on the server

install -m 700 scripts/backup-haij.sh /root/backup-haij.sh
echo 'age1...' > /root/haij-backup.pub   # the public key from above
rclone config                            # configure an EU remote named eu-storage
/root/backup-haij.sh                     # run it once by hand
```

```
# crontab -e
15 2 * * * /root/backup-haij.sh
```

Keep the age private key offline, never on the server: a backup an attacker
on the server can decrypt is not a backup, it is a second copy of the leak.
Test a restore at least quarterly — an untested backup is a hope, not a
plan:

```bash
age -d -i haij-backup.key haij-2026-01-01.dump.age | pg_restore -d haij_restore
```

Any new storage or email provider goes into `docs/subprocessors.md` first.

## 7. Updating

Push to `main` → Coolify redeploys. The `migrate` service runs before the
new app container starts, so migrations are always applied first. Keep
migrations backwards compatible with the previous app version (expand →
migrate → contract) once real users are on the platform.

After each deploy, the About page is the check: if the commit shown is not
the one you pushed, the deploy did not do what you think it did.

## 8. Moving provider (exit plan)

1. Provision a VPS at the new EU provider, install Coolify, connect the repo.
2. Set the same environment variables.
3. Restore the latest dump into the new `db` service (section 4).
4. Flip DNS. Everything is Docker + Postgres; nothing is provider-specific.
