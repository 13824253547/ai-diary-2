# Production Deployment

Deployment files are specific to this application. Never copy the local development
Compose file or development credentials to production.

## Architecture

- Build Linux images locally using `Dockerfile.production`; do not build on production.
- Runtime startup uses `server.cjs`, binding the API to `127.0.0.1:3001`.
- The backend uses host networking so the only trusted Nginx peer is loopback.
- MySQL is published at `127.0.0.1:33307`, Redis at `127.0.0.1:36380`.
- Compose named volumes hold database and Redis data.
- `photo-assets` and `generation-tmp` are separate bind-mounted directories.
- Nginx serves `/api/` and the draft page at `/privacy-policy` with existing TLS.

## Build

From the repository root:

```sh
docker buildx build --platform linux/amd64 --target runtime \
  -f backend/Dockerfile.production -t orange-glow-backend:RELEASE --load backend
docker buildx build --platform linux/amd64 --target migration \
  -f backend/Dockerfile.production -t orange-glow-backend:RELEASE-migration --load backend
```

The default Node base image is the Docker Official Image on AWS Public ECR.
Use the same immutable release tag for both images. Secrets, database contents
and material assets are excluded from the build context.

## Server Files

Use `/opt/orange-glow` as the application directory:

- `compose.production.yml`: this application's services only.
- `.env`: `RELEASE_TAG`, no business credentials.
- `backend.env`: production database/provider/identity configuration, mode `0600`.
- `mysql.env`: independent application database and root credentials, mode `0600`.
- `photo-assets`, `generation-tmp`: writable by UID/GID `1000`, mode `0750`.
- `backups`: protected Nginx and database backups; do not serve publicly.

`tools/prepare-production-environment.js` initializes these environment files
via SSH stdin and refuses to overwrite existing files. It copies only allowed
server-side provider variables and generates independent production database and
JWT credentials. It does not copy local user data or the development JWT secret.

## Operations

Run these on the server:

```sh
sudo docker compose --project-directory /opt/orange-glow \
  -f /opt/orange-glow/compose.production.yml ps
sudo docker compose --project-directory /opt/orange-glow \
  -f /opt/orange-glow/compose.production.yml logs --tail 50 backend
sudo docker compose --project-directory /opt/orange-glow \
  -f /opt/orange-glow/compose.production.yml run --rm migrate
```

Back up the application database before migrations. Never run database E2E,
`db push`, schema resets, or development test scripts against production.
Do not use `compose down -v`; that removes persistent data.

Nginx must overwrite `X-Real-IP` with `$remote_addr`, not trust a caller-provided
forwarded header. The controller trusts this value only from loopback. A CDN or
other external proxy is not included in this trust model.

The health endpoint requires a valid server-issued device identity. Container
health checks test the loopback listener only; they do not prove provider quality,
App Attest enrollment, or authenticated business operations.

## Transitional Installation Authentication

The current client uses `identityMode: installation`. Set
`DEVICE_IDENTITY_MODE=installation` and configure the server-only
`INSTALLATION_AUTH_PRIVATE_KEY` (base64 PKCS8 Ed25519). Installation keys are not
Apple hardware attestation; see `docs/reference/delivery/contracts/installation-identity-v1.md`.
Do not disable the production guard or accept a self-declared owner ID.
Keep `DEVICE_AUTH_JWT_SECRET` for keyed rate-limit buckets and existing App Attest tokens.

For an authentication-only release, build the full candidate locally, then build
`Dockerfile.identity-patch` with `AUTH_IMAGE` pointing to that candidate and
`BASE_IMAGE` pointing to the exact previous production image. Only six identity
modules are copied, so parallel business changes are not deployed.
Verify all non-identity file hashes against the original image before publishing.
This patch needs no schema migration; the existing identity tables separate
installation records with `environment=installation-ed25519-v1`.

Before changing server configuration, download a protected backup locally.
`tools/configure-installation-auth.cjs` can then run via SSH stdin in a Node
container with `/opt/orange-glow` mounted at `/deployment` and
`INSTALLATION_RELEASE` set to the new image tag. It backs up both environment
files before atomic replacement, generates the signing key server-side, and
does not print secrets. Retain the prior image and both environment backups.
Restoring the old release and environment does not delete installation data,
but old App Attest-only code will reject installation credentials.

## Privacy Policy Page

Generate the page from the local policy source:

```sh
pandoc docs/reference/privacy-policy-self-developed-draft.md --standalone \
  --to html5 --template backend/deployment/privacy.template.html \
  --output docs/reference/privacy-policy.html
```

Review unresolved placeholders and operational claims against the actual service
before publication. Rendering does not validate the policy statements.

## Rollback

Retain previous images and Nginx configuration before each release. Validate
`nginx -t` before reload. If a release fails, restore the previous image tag and
start the backend; do not silently undo database migrations or delete data.
Restore a database backup only under a separate, explicitly approved recovery
procedure, since restoration can discard newer writes.
