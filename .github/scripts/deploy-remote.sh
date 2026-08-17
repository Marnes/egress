#!/usr/bin/env bash
#
# Runs ON the VPS. The deploy workflow pipes this in over stdin on a single SSH
# connection, prefixed with `export` lines and the compose file, so no secret
# ever appears in a remote command line (readable via `ps` on a shared box).
#
# Expects in the environment: GHCR_USER, GHCR_TOKEN, IMAGE_TAG.
# Expects /opt/egress/docker-compose.prod.yml to already be written.
#
# This box also runs isitadeal, hyranx, opensite/core and infra. Every docker
# command below is scoped to the egress project -- keep it that way.
set -euo pipefail

cd /opt/egress

# Authenticate in a THROWAWAY docker config dir. /root/.docker/config.json is
# shared with isitadeal, hyranx and opensite, whose images are private and which
# rely on the box staying logged in to ghcr.io -- an earlier version of this
# script logged in there and then ran `docker logout` on exit, which silently
# wiped their credentials too. Scoping the login here means egress can never
# affect another stack's ability to pull, and no egress credential outlives the
# deploy.
DOCKER_CONFIG="$(mktemp -d)"
export DOCKER_CONFIG
trap 'rm -rf "$DOCKER_CONFIG"' EXIT

printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin

# Consumed by docker-compose.prod.yml to pin the exact image built for this commit.
export EGRESS_IMAGE_TAG="$IMAGE_TAG"

# -p egress preserves the project name that binds the container to the
# egress_egress_data volume holding the SQLite database. Do not change it.
compose() { docker compose -p egress -f docker-compose.prod.yml "$@"; }

echo "--- Pulling $IMAGE_TAG ---"
compose pull

echo "--- Restarting ---"
compose up -d --remove-orphans

echo "--- Waiting for health ---"
for i in $(seq 1 30); do
  status="$(docker inspect --format '{{.State.Health.Status}}' egress-egress-1 2>/dev/null || echo missing)"
  echo "attempt $i: $status"
  if [ "$status" = "healthy" ]; then
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "Container never became healthy. Recent logs:"
    docker logs --tail 50 egress-egress-1 || true
    exit 1
  fi
  sleep 5
done

echo "Deploy healthy on $IMAGE_TAG."

echo "--- Pruning superseded egress images ---"
# --no-trunc so these IDs match .Image ("sha256:..."); otherwise the comparison
# never hits and we would try to remove the image that is currently running.
keep="$(docker inspect --format '{{.Image}}' egress-egress-1 2>/dev/null || true)"
docker images --no-trunc --format '{{.ID}} {{.Repository}}:{{.Tag}}' \
  | awk '$2 ~ /^ghcr\.io\/marnes\/egress:/ {print $1" "$2}' \
  | while read -r id ref; do
      if [ "$id" != "$keep" ]; then
        docker rmi "$ref" >/dev/null 2>&1 || true
      fi
    done
echo "Done. Other projects untouched."
