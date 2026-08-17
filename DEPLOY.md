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
   └─ deploy    runner joins the tailnet, then ONE ssh connection,
                retried up to 3×, carrying the compose file +
                .github/scripts/deploy-remote.sh
                which then: pull → up -d → wait for healthy → prune
```

**The runner reaches the box over Tailscale, not its public IP.** The provider
filters a rotating subset of GitHub's runner IPs — packets never reach `sshd`,
so it was never fail2ban (not installed) and no server-side config could fix it.
Roughly half of all deploy attempts ever made over the public IP failed. The
runner now joins the tailnet as an ephemeral node tagged `tag:ci` and drops off
when the job ends. `known_hosts` is pinned to the box's real host key under its
tailnet name, so the host is still verified rather than trusted on first use.

All four of this box's stacks (egress, isitadeal, hyranx, opensite) now deploy
this way and share one Tailscale OAuth client.

The whole remote side is `.github/scripts/deploy-remote.sh`, piped in over
stdin rather than run as SSH arguments — that keeps the registry token out of
`ps` on a box that runs other people's services.

It also logs in to GHCR under a throwaway `DOCKER_CONFIG`. `/root/.docker/
config.json` is shared with the other three stacks, whose images are private; an
earlier version logged in there and ran `docker logout` on exit, which silently
wiped their credentials too. Never reintroduce a global `docker logout` here.

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
| `TS_OAUTH_CLIENT_ID` | Tailscale OAuth client, scoped to `tag:ci` |
| `TS_OAUTH_SECRET` | Its secret. Unlike an auth key, this does not expire |
| `DEPLOY_SSH_KEY` | Private half of a **CI-only** ed25519 key |
| `DEPLOY_KNOWN_HOSTS` | The box's host key under its tailnet name, so CI verifies the host instead of blindly trusting it |
| `DEPLOY_HOST` | `absolute-vps` — the **tailnet** name, not the public IP |
| `DEPLOY_USER` | `root` |

The Tailscale OAuth pair is shared across all four repos. `tag:ci` must be
listed in `tagOwners` in the [ACL policy](https://login.tailscale.com/admin/acls/file)
or Tailscale refuses to mint keys for it.

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

**Deploy fails with `Connection timed out`** — traffic goes over the tailnet
now, so this means the box fell off Tailscale, not the old public-IP filtering:

```bash
ssh -i ~/.ssh/absolute_vps root@102.202.192.133 'tailscale status; systemctl status tailscaled'
```

Nothing is left half-applied when this happens: the connection fails before any
container is touched, and the running version keeps serving. The remote script
is idempotent, so a retry after a partial run is safe.

**Deploy fails at the "Connect to tailnet" step** — the OAuth client was revoked
or `tag:ci` was removed from `tagOwners`. Check the
[OAuth clients page](https://login.tailscale.com/admin/settings/oauth).

**Historical note:** before Tailscale, deploys ran over the public IP and about
half of all attempts timed out, because the provider filters a rotating subset
of GitHub's runner IPs. If you ever see that again, do not chase fail2ban — it
is not installed, and UFW allows OpenSSH from anywhere. The packets simply never
arrive.

**Deploy fails with `Permission denied (publickey)`** — that is a real auth
problem, not the above. Confirm the key is still installed:

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

## The other stacks on this box

All four deploy from GitHub Actions over the same tailnet, with the same
`tag:ci` OAuth client and the same pinned `known_hosts`. Each has its own
CI-only SSH key, so any one can be revoked without touching the others.

| Stack | Repo | Trigger | Remote script |
| --- | --- | --- | --- |
| egress | `Marnes/egress` | push to `main` | `.github/scripts/deploy-remote.sh` |
| isitadeal | `Marnes/isitadeal` | `workflow_dispatch` | `/opt/isitadeal/redeploy.sh` |
| opensite | `Marnes/opensite` | `workflow_dispatch` | `/opt/opensite/core/redeploy.sh` |
| hyranx | `Marnes/elomusk` | `workflow_dispatch` | `/opt/hyranx/redeploy.sh` |

The other three are dispatch-only by design: their images are built by separate
workflows on push, and a deploy just rolls the box onto whatever `:latest`
points at — so let those builds go green first. They also expect a registry
token now (falling back to `GITHUB_TOKEN`) rather than relying on the box
staying logged in to ghcr.io.

## Shared-host rules

The VPS runs other people's production traffic. When working on it:

- Scope every compose command with `-p egress -f docker-compose.prod.yml`.
- **Never** run `docker system prune -a`, `docker volume prune`, or a bare
  `docker compose down` from the wrong directory — you will take down
  `isitadeal`, `hyranx`, or `opensite`.
- The `edge` network is shared and declared `external`. Don't recreate it.
- Leave `/opt/infra/Caddyfile` alone unless you are changing routing; back it up
  first (there is an existing `.bak.*` convention there).
