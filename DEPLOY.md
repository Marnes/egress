# Deploying Egress

Production is <https://egress.co.za>, served from a single VPS at
`102.202.192.133` (hostname `opensite`).

Deploys are automatic: **push to `main` and the pipeline ships it.** Everything
below is either background or break-glass.

---

## How it works

```
push to main
   │
   ├─ verify    ci.yml → lint · typecheck · test · build
   │
   ├─ build     docker build on a GitHub runner
   │            └─ push ghcr.io/marnes/egress:{sha-<12>, latest}
   │
   └─ deploy    scp docker-compose.prod.yml → /opt/egress/
                ssh → docker compose pull && up -d
                ssh → wait for HEALTHCHECK to report healthy
                ssh → remove superseded egress images
```

The image is built **on GitHub's runners, not on the VPS**. That box has ~3.8GB
of RAM shared with several other production stacks (`isitadeal`, `hyranx`,
`opensite`/`core`, `infra`), and running the Vite/three.js bundle there put
those at risk. The server only ever pulls a finished image.

### On the server

| Thing | Value |
| --- | --- |
| Directory | `/opt/egress` |
| Compose project | `egress` (do not rename — see below) |
| Compose file | `/opt/egress/docker-compose.prod.yml` (shipped by CI) |
| Container | `egress-egress-1` |
| Data volume | `egress_egress_data` → `/data` (SQLite lives here) |
| Port | `8787`, internal to the `edge` Docker network only |

`/opt/egress` still contains the old git checkout and `docker-compose.yml` from
when deploys were done by hand. The pipeline does not read either of them — it
only writes and uses `docker-compose.prod.yml`. Once you're happy the pipeline
is working, the rest of that directory can be deleted; nothing but the compose
file is needed there. (The SQLite database lives in a Docker volume, not in this
directory, so removing it is safe.)

TLS and routing are handled by **Caddy**, a separate stack at `/opt/infra`. It
terminates TLS with a Cloudflare origin cert, rejects any request not coming
from a Cloudflare IP range, and proxies to `egress:8787` over the shared
external `edge` network. Egress publishes **no host ports** — it is only
reachable through Caddy.

> [!IMPORTANT]
> The compose project name must stay `egress`. The SQLite volume is named
> `egress_egress_data` — `<project>_<volume>`. Renaming the project silently
> points the app at a brand-new empty volume and the database "disappears".

---

## Normal deploy

```bash
git push origin main
```

Then watch it:

```bash
gh run watch --repo Marnes/egress
```

The `deploy` job fails the build if the container does not report `healthy`
within ~150s, so a red pipeline means the new version did not come up.

To redeploy the current `main` without a new commit, run the **Deploy** workflow
from the Actions tab, or:

```bash
gh workflow run deploy.yml --repo Marnes/egress
```

---

## Rollback

Every deploy is tagged with its commit, so rolling back is just starting an
older image. SSH in and pin the tag:

```bash
ssh -i ~/.ssh/absolute_vps root@102.202.192.133
cd /opt/egress

# List what's available locally
docker images ghcr.io/marnes/egress

# Roll back (first 12 chars of the good commit SHA)
EGRESS_IMAGE_TAG=sha-abc123def456 \
  docker compose -p egress -f docker-compose.prod.yml up -d
```

If the image is no longer on the box, pull it first — tags live in
[GHCR](https://github.com/Marnes/egress/pkgs/container/egress):

```bash
docker pull ghcr.io/marnes/egress:sha-abc123def456
```

To make the rollback permanent, revert the commit on `main` and push; otherwise
the next deploy replaces it.

---

## Secrets

Repository secrets used by `.github/workflows/deploy.yml`:

| Secret | Purpose |
| --- | --- |
| `DEPLOY_SSH_KEY` | Private half of a **CI-only** ed25519 key |
| `DEPLOY_KNOWN_HOSTS` | Server host keys, so CI verifies the host instead of blindly trusting it |
| `DEPLOY_HOST` | `102.202.192.133` |
| `DEPLOY_USER` | `root` |

`GITHUB_TOKEN` is provided automatically and covers both the GHCR push and the
server-side pull; no long-lived registry credential is stored on the VPS.

The deploy key is dedicated to this pipeline — it is **not** your personal
`absolute_vps` key, so revoking it costs nothing elsewhere. Its public half is
in `/root/.ssh/authorized_keys`, commented `github-actions-deploy@egress`.

### Rotating the deploy key

```bash
ssh-keygen -t ed25519 -N "" -C "github-actions-deploy@egress" -f /tmp/egress_deploy
ssh-copy-id -i /tmp/egress_deploy.pub -o IdentityFile=~/.ssh/absolute_vps root@102.202.192.133
gh secret set DEPLOY_SSH_KEY --repo Marnes/egress < /tmp/egress_deploy

# Then drop the old line from the server
ssh -i ~/.ssh/absolute_vps root@102.202.192.133 \
  "sed -i '/github-actions-deploy@egress/d' /root/.ssh/authorized_keys"
# ...and re-add the new one if sed removed both.
rm /tmp/egress_deploy /tmp/egress_deploy.pub
```

---

## Manual deploy (break-glass)

Only if GitHub Actions is unavailable. Build locally and push the image, rather
than building on the VPS:

```bash
docker build --build-arg VITE_PUBLIC_URL=https://egress.co.za \
  -t ghcr.io/marnes/egress:manual .
docker push ghcr.io/marnes/egress:manual

ssh -i ~/.ssh/absolute_vps root@102.202.192.133 \
  "cd /opt/egress && EGRESS_IMAGE_TAG=manual \
     docker compose -p egress -f docker-compose.prod.yml up -d"
```

---

## Troubleshooting

**Check status and logs**

```bash
ssh -i ~/.ssh/absolute_vps root@102.202.192.133
docker ps --filter name=egress
docker logs --tail 100 -f egress-egress-1
docker inspect --format '{{.State.Health.Status}}' egress-egress-1
```

**Site returns 502** — the container is down or unhealthy. Check the logs above.
Caddy is fine if the other sites still resolve.

**Site returns 403** — that is the Cloudflare-IP guard in
`/opt/infra/Caddyfile` doing its job. You hit the origin directly instead of
going through Cloudflare. Use the real hostname.

**Deploy job can't connect** — confirm the key still works:

```bash
ssh -i ~/.ssh/absolute_vps root@102.202.192.133 \
  "grep -c github-actions-deploy@egress /root/.ssh/authorized_keys"
```

**Pull fails with `denied`** — the GHCR package visibility changed. Either make
it public in the package settings, or confirm the deploy job still has
`packages: read`.

**Database** — SQLite in the `egress_egress_data` volume. It survives deploys;
`docker compose down -v` would destroy it. Back it up before anything invasive:

```bash
ssh -i ~/.ssh/absolute_vps root@102.202.192.133 \
  "docker run --rm -v egress_egress_data:/data -v /root:/backup alpine \
     tar czf /backup/egress-db-\$(date +%F).tar.gz -C /data ."
```

---

## Shared-host rules

The VPS runs other people's production traffic. When working on it:

- Scope every compose command with `-p egress -f docker-compose.prod.yml`.
- **Never** run `docker system prune -a`, `docker volume prune`, or a bare
  `docker compose down` from the wrong directory — you will take down
  `isitadeal`, `hyranx`, or `opensite`.
- The `edge` network is shared and declared `external`. Don't recreate it.
- Leave `/opt/infra/Caddyfile` alone unless you are changing routing; back it up
  first (there is an existing `.bak.*` convention there).
