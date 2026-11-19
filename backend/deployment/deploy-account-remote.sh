#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

root=/opt/orange-glow-account
nginx_file=/etc/nginx/orange-glow.locations.conf
action="${1:-}"
release="${2:-}"
archive_sha="${3:-}"
nginx_sha="${4:-}"
backend_env_sha="${5:-}"

if [[ ! "$release" =~ ^r[0-9]{14}-[a-f0-9]{8}$ ]]; then
  echo "Invalid release identifier." >&2
  exit 2
fi
release_dir="$root/releases/$release"

case "$action" in
  stage)
    test ! -L "$root"
    mkdir -p "$root/releases" "$root/backups"
    if ! mkdir "$root/.deploy.lock" 2>/dev/null; then
      echo "Another deployment is running or a stale lock requires investigation." >&2
      exit 1
    fi
    trap 'status=$?; if [ "$status" -ne 0 ]; then rmdir "$root/.deploy.lock" 2>/dev/null || true; fi' EXIT
    mkdir "$release_dir"
    ;;
  unlock)
    test -d "$root/.deploy.lock"
    rmdir "$root/.deploy.lock"
    ;;
  seed-archive)
    [[ "$archive_sha" =~ ^[a-f0-9]{64}$ ]]
    [[ "$nginx_sha" =~ ^[a-f0-9]{64}$ ]]
    test -d "$root/.deploy.lock"
    test -d "$release_dir"
    test ! -L "$release_dir"
    test "$(readlink -f "$root/releases")" = "$root/releases"
    test "$(readlink -f "$release_dir")" = "$release_dir"
    test ! -e "$release_dir/images.tar"
    test ! -L "$release_dir/images.tar"
    if [ ! -e "$root/current" ] && [ ! -L "$root/current" ]; then
      echo full-initial
      exit 0
    fi
    test -L "$root/current"
    previous="$(readlink -f "$root/current")"
    previous_id="${previous##*/}"
    [[ "$previous" = "$root/releases/$previous_id" && "$previous_id" =~ ^r[0-9]{14}-[a-f0-9]{8}$ ]]
    test -d "$previous"
    test ! -L "$previous"
    if [ ! -f "$previous/images.tar" ]; then
      echo full-no-baseline
      exit 0
    fi
    test ! -L "$previous/images.tar"
    if [ -f "$previous/dependency.sha256" ]; then
      test ! -L "$previous/dependency.sha256"
      if [ "$(cat "$previous/dependency.sha256")" != "$archive_sha" ]; then
        echo full-dependencies-changed
        exit 0
      fi
    else
      test ! -L "$previous/dependency.sha256"
      old_runtime="$(docker image inspect --format '{{json .RootFS.Layers}}' "orange-glow-account-backend:$previous_id" 2>/dev/null || true)"
      old_migration="$(docker image inspect --format '{{json .RootFS.Layers}}' "orange-glow-account-backend:$previous_id-migration" 2>/dev/null || true)"
      old_layers_sha="$(printf '%s\n%s\n' "$old_runtime" "$old_migration" | python3 -c '
import hashlib, json, re, sys
runtime = json.loads(sys.stdin.readline())
migration = json.loads(sys.stdin.readline())
if not isinstance(runtime, list) or len(runtime) < 4 or not isinstance(migration, list) or len(migration) < 2:
    raise SystemExit(1)
if not all(isinstance(v, str) and re.fullmatch(r"sha256:[a-f0-9]{64}", v) for v in runtime + migration):
    raise SystemExit(1)
data = json.dumps([runtime[:-3], migration[:-1]], separators=(",", ":")).encode()
print(hashlib.sha256(data).hexdigest())
' 2>/dev/null || true)"
      if [ "$old_layers_sha" != "$nginx_sha" ]; then
        echo full-no-baseline
        exit 0
      fi
    fi
    cp "$previous/images.tar" "$release_dir/images.tar"
    echo seeded
    ;;
  activate)
    [[ "$archive_sha" =~ ^[a-f0-9]{64}$ && "$nginx_sha" =~ ^[a-f0-9]{64}$ ]]
    [[ "$backend_env_sha" = new || "$backend_env_sha" =~ ^[a-f0-9]{64}$ ]]
    test -d "$root/.deploy.lock"
    test -f "$release_dir/images.tar"
    test -f "$release_dir/compose.account.yml"
    test -f "$root/shared/backend.env"
    test -f "$root/shared/mysql.env"
    test -f "$release_dir/backend-candidate.env"
    for item in "$root/shared" "$root/shared/backend.env" "$root/shared/mysql.env" \
      "$root/shared/mysql-data" "$root/shared/photo-assets" "$root/shared/generation-tmp"; do
      test ! -L "$item" || { echo "Symlinked account data or configuration is not permitted." >&2; exit 1; }
    done
    for item in "$root/shared/mysql-data" "$root/shared/photo-assets" "$root/shared/generation-tmp"; do
      test -d "$item"
      test "$(readlink -f "$item")" = "$item"
    done
    if [ "$backend_env_sha" != new ]; then
      test "$(sha256sum "$root/shared/backend.env" | cut -d' ' -f1)" = "$backend_env_sha"
    fi
    test ! -L "$nginx_file"
    test "$(sha256sum "$release_dir/images.tar" | cut -d' ' -f1)" = "$archive_sha"
    test "$(sha256sum "$nginx_file" | cut -d' ' -f1)" = "$nginx_sha"

    previous=''
    if [ -e "$root/current" ] || [ -L "$root/current" ]; then
      test -L "$root/current"
      previous="$(readlink -f "$root/current")"
      case "$previous" in "$root"/releases/r*) ;; *) echo "Invalid current release." >&2; exit 1;; esac
      test -f "$previous/compose.account.yml"
      test -f "$previous/release.env"
      if ! cmp -s "$previous/compose.account.yml" "$release_dir/compose.account.yml"; then
        echo "Infrastructure configuration changed; review it before deployment." >&2
        exit 1
      fi
    fi
    if [ -e "$root/shared/migration.inprogress" ]; then
      echo "A previous initial migration was interrupted; manual review is required." >&2
      exit 1
    fi

    printf 'RELEASE_TAG=%s\n' "$release" > "$release_dir/release.env"
    chmod 600 "$release_dir/release.env"
    compose=(docker compose --project-name orange-glow-account --env-file "$release_dir/release.env" -f "$release_dir/compose.account.yml")
    mkdir "$root/backups/$release"
    cp -p "$nginx_file" "$root/backups/$release/nginx.locations.conf"
    cp -p "$root/shared/backend.env" "$root/backups/$release/backend.env"
    switched=0
    backend_started=0
    config_updated=0
    rollback() {
      status=$?
      if [ "$status" -ne 0 ]; then
        echo "Deployment failed; restoring the previous route and backend." >&2
        if [ "$switched" -eq 1 ]; then
          if ! cp -p "$root/backups/$release/nginx.locations.conf" "$nginx_file.$release.rollback" \
            || ! mv -f "$nginx_file.$release.rollback" "$nginx_file" \
            || ! nginx -t || ! systemctl reload nginx; then
            echo "CRITICAL: Nginx rollback failed; restore the saved configuration manually." >&2
          fi
        fi
        if [ "$config_updated" -eq 1 ]; then
          { cp -p "$root/backups/$release/backend.env" "$root/shared/backend.$release.rollback" \
            && mv -f "$root/shared/backend.$release.rollback" "$root/shared/backend.env"; } || \
            echo "CRITICAL: backend configuration could not be restored." >&2
        fi
        if [ "$backend_started" -eq 1 ]; then
          if [ -n "$previous" ]; then
            previous_tag="${previous##*/}"
            if ! docker image inspect "orange-glow-account-backend:$previous_tag" >/dev/null 2>&1; then
              docker load -i "$previous/images.tar" || echo "CRITICAL: previous image could not be loaded." >&2
            fi
            docker compose --project-name orange-glow-account --env-file "$previous/release.env" -f "$previous/compose.account.yml" up -d --no-deps backend || \
              echo "CRITICAL: previous backend could not be restored." >&2
          else
            "${compose[@]}" stop backend || echo "Could not stop the new backend." >&2
          fi
        fi
      fi
      exit "$status"
    }
    trap rollback EXIT

    docker load -i "$release_dir/images.tar"
    docker image inspect "orange-glow-account-backend:$release" >/dev/null
    docker image inspect "orange-glow-account-backend:$release-migration" >/dev/null
    "${compose[@]}" config -q
    "${compose[@]}" up -d --no-recreate mysql
    mysql_id="$("${compose[@]}" ps -q mysql)"
    test -n "$mysql_id"
    ready=0
    for attempt in {1..60}; do
      if [ "$(docker inspect --format '{{.State.Health.Status}}' "$mysql_id")" = healthy ]; then
        ready=1
        break
      fi
      sleep 2
    done
    test "$ready" -eq 1 || { echo "Isolated MySQL did not become healthy." >&2; exit 1; }
    mysql_mount="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/var/lib/mysql"}}{{.Source}}{{end}}{{end}}' "$mysql_id")"
    test "$mysql_mount" = "$root/shared/mysql-data" || {
      echo "MySQL data directory is not the dedicated account directory." >&2
      exit 1
    }
    "${compose[@]}" run --rm --no-deps --entrypoint node migrate -e '
      const u = new URL(process.env.DATABASE_URL || "");
      if (u.protocol !== "mysql:" || u.hostname !== "127.0.0.1"
          || u.port !== "33308" || u.username !== "orange_account"
          || u.pathname !== "/orange_account"
          || process.env.NODE_ENV !== "production"
          || process.env.PORT !== "3002"
          || process.env.PHOTO_ASSET_STORAGE_DIR !== "/data/photo-assets"
          || process.env.DIARY_GENERATION_TMP_DIR !== "/data/generation-tmp"
          || process.env.DIARY_GENERATION_PROVIDER !== "ark-openai-compatible"
          || Buffer.byteLength(process.env.ACCOUNT_AUTH_JWT_SECRET || "") < 32) {
        console.error("Isolated backend configuration check failed.");
        process.exit(1);
      }
    '

    if [ ! -f "$root/shared/initialized" ]; then
      test -z "$previous"
      tables="$(docker exec "$mysql_id" sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysql -u "$MYSQL_USER" -N -e "SHOW TABLES" "$MYSQL_DATABASE"')"
      test -z "$tables" || { echo "The new account database is not empty; refusing initial migration." >&2; exit 1; }
      : > "$root/shared/migration.inprogress"
      "${compose[@]}" run --rm --no-deps migrate
      : > "$root/shared/initialized"
      rm "$root/shared/migration.inprogress"
    else
      "${compose[@]}" run --rm --no-deps migrate ./node_modules/.bin/prisma migrate status
    fi
    if [ "$backend_env_sha" != new ] && [ "$(sha256sum "$root/shared/backend.env" | cut -d' ' -f1)" != "$backend_env_sha" ]; then
      echo "Backend configuration changed during deployment; refusing to overwrite it." >&2
      exit 1
    fi
    cp -p "$release_dir/backend-candidate.env" "$root/shared/backend.$release.tmp"
    config_updated=1
    mv -f "$root/shared/backend.$release.tmp" "$root/shared/backend.env"
    backend_started=1
    "${compose[@]}" up -d --no-deps backend
    backend_id="$("${compose[@]}" ps -q backend)"
    test -n "$backend_id"
    ready=0
    for attempt in {1..40}; do
      if [ "$(docker inspect --format '{{.State.Health.Status}}' "$backend_id")" = healthy ]; then
        ready=1
        break
      fi
      sleep 2
    done
    test "$ready" -eq 1 || { echo "New backend did not become healthy." >&2; exit 1; }

    if [ "$(sha256sum "$nginx_file" | cut -d' ' -f1)" != "$nginx_sha" ]; then
      echo "Nginx configuration changed during deployment; refusing to overwrite it." >&2
      exit 1
    fi
    tmp="$nginx_file.$release.tmp"
    cp -p "$nginx_file" "$tmp"
    python3 - "$tmp" <<'PY'
import re, sys
path = sys.argv[1]
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()
pattern = r'(?m)^([ \t]*proxy_pass[ \t]+http://127\.0\.0\.1:)(?:3001|3002)([ \t]*;[ \t]*)$'
text, count = re.subn(pattern, r'\g<1>3002\2', text)
if count != 1:
    raise SystemExit('Expected exactly one known API proxy target.')
with open(path, 'w', encoding='utf-8') as f:
    f.write(text)
PY
    switched=1
    mv -f "$tmp" "$nginx_file"
    nginx -t
    systemctl reload nginx
    link="$root/current.$release"
    ln -s "$release_dir" "$link"
    mv -Tf "$link" "$root/current"
    trap - EXIT
    echo "Deployment succeeded. Old database and media were not touched."
    ;;
  *)
    echo "Unknown deployment action." >&2
    exit 2
    ;;
esac
