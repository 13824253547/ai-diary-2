#!/bin/sh
set -eu

legacy_database="ai_diary_migration_legacy_$$"
fresh_database="ai_diary_migration_fresh_$$"
baseline_database="ai_diary_migration_baseline_$$"

cleanup() {
  docker compose -f docker-compose.local.yml exec -T mysql \
    mysql -uroot -proot -e "DROP DATABASE IF EXISTS ${legacy_database}" >/dev/null 2>&1 || true
  docker compose -f docker-compose.local.yml exec -T mysql \
    mysql -uroot -proot -e "DROP DATABASE IF EXISTS ${fresh_database}" >/dev/null 2>&1 || true
  docker compose -f docker-compose.local.yml exec -T mysql \
    mysql -uroot -proot -e "DROP DATABASE IF EXISTS ${baseline_database}" >/dev/null 2>&1 || true
}

trap cleanup 0 1 2 15

docker compose -f docker-compose.local.yml exec -T mysql \
  mysql -uroot -proot -e "CREATE DATABASE ${legacy_database}"
docker compose -f docker-compose.local.yml exec -T mysql \
  mysql -uroot -proot -e "CREATE DATABASE ${fresh_database}"
docker compose -f docker-compose.local.yml exec -T mysql \
  mysql -uroot -proot -e "CREATE DATABASE ${baseline_database}"

docker compose -f docker-compose.local.yml exec -T mysql \
  mysql -uroot -proot "${legacy_database}" \
  < prisma/migrations/20261015000000_initial_schema/migration.sql

docker compose -f docker-compose.local.yml exec -T mysql \
  mysql -uroot -proot -D "${legacy_database}" -e \
  "INSERT INTO Diary (id, ownerDeviceId, draftId, title, summary, location, date, privacy, photoIds, publicBlockIds, version, createdAt, updatedAt) VALUES ('legacy-diary', 'migration-device', 'legacy-draft', 'Legacy diary', 'Old summary', 'Old location', '2026-10-15 12:00:00.000', 'private', JSON_ARRAY('photo-1', 'photo-2', 'photo-3'), NULL, 1, '2026-10-15 12:00:00.000', '2026-10-15 12:00:00.000')"

if drift_output=$(DATABASE_URL="mysql://root:root@127.0.0.1:33306/${legacy_database}" \
  npx ts-node scripts/baseline-prisma-migrations.ts --confirm-current-schema-is-final 2>&1); then
  printf 'Baseline command accepted a schema with drift.\n' >&2
  exit 1
fi
case "${drift_output}" in
  *"Database schema differs from the current Prisma datamodel"*) ;;
  *)
    printf 'Baseline did not fail for the expected schema drift:\n%s\n' "${drift_output}" >&2
    exit 1
    ;;
esac
history_table_count=$(docker compose -f docker-compose.local.yml exec -T mysql \
  mysql -uroot -proot -D "${legacy_database}" -N -e \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = '_prisma_migrations'")
if [ "${history_table_count}" != "0" ]; then
  printf 'Baseline refusal changed migration history unexpectedly.\n' >&2
  exit 1
fi

DATABASE_URL="mysql://root:root@127.0.0.1:33306/${legacy_database}" \
  npx prisma migrate resolve --applied 20261015000000_initial_schema
DATABASE_URL="mysql://root:root@127.0.0.1:33306/${legacy_database}" \
  npx prisma migrate deploy

record=$(docker compose -f docker-compose.local.yml exec -T mysql \
  mysql -uroot -proot -D "${legacy_database}" -N -e \
  "SELECT CONCAT(id, ':', title, ':', summary, ':', contentSnapshot IS NULL) FROM Diary WHERE id = 'legacy-diary'")

if [ "${record}" != "legacy-diary:Legacy diary:Old summary:1" ]; then
  printf 'Migration changed or lost the legacy diary: %s\n' "${record}" >&2
  exit 1
fi

DATABASE_URL="mysql://root:root@127.0.0.1:33306/${legacy_database}" \
  npx prisma migrate diff --exit-code \
  --from-url "mysql://root:root@127.0.0.1:33306/${legacy_database}" \
  --to-schema-datamodel prisma/schema.prisma
DATABASE_URL="mysql://root:root@127.0.0.1:33306/${legacy_database}" \
  npx prisma migrate status

DATABASE_URL="mysql://root:root@127.0.0.1:33306/${fresh_database}" \
  npx prisma migrate deploy
DATABASE_URL="mysql://root:root@127.0.0.1:33306/${fresh_database}" \
  npx prisma migrate diff --exit-code \
  --from-url "mysql://root:root@127.0.0.1:33306/${fresh_database}" \
  --to-schema-datamodel prisma/schema.prisma

docker compose -f docker-compose.local.yml exec -T mysql \
  mysql -uroot -proot "${baseline_database}" \
  < prisma/migrations/20261015000000_initial_schema/migration.sql
docker compose -f docker-compose.local.yml exec -T mysql \
  mysql -uroot -proot "${baseline_database}" \
  < prisma/migrations/20261015001000_diary_content_snapshot/migration.sql
docker compose -f docker-compose.local.yml exec -T mysql \
  mysql -uroot -proot -D "${baseline_database}" -e \
  "INSERT INTO Diary (id, ownerDeviceId, draftId, title, summary, location, date, privacy, photoIds, publicBlockIds, contentSnapshot, version, createdAt, updatedAt) VALUES ('baseline-diary', 'baseline-device', 'baseline-draft', 'Baseline diary', 'Existing data', 'Taipei', '2026-10-15 12:00:00.000', 'private', JSON_ARRAY('photo-1'), NULL, JSON_OBJECT('type', 'travel', 'blocks', JSON_ARRAY()), 1, '2026-10-15 12:00:00.000', '2026-10-15 12:00:00.000')"

if confirmation_output=$(DATABASE_URL="mysql://root:root@127.0.0.1:33306/${baseline_database}" \
  npx ts-node scripts/baseline-prisma-migrations.ts 2>&1); then
  printf 'Baseline command accepted without explicit confirmation.\n' >&2
  exit 1
fi
case "${confirmation_output}" in
  *"Pass --confirm-current-schema-is-final"*) ;;
  *)
    printf 'Baseline command failed for an unexpected reason:\n%s\n' "${confirmation_output}" >&2
    exit 1
    ;;
esac

DATABASE_URL="mysql://root:root@127.0.0.1:33306/${baseline_database}" \
  npx prisma migrate resolve --applied 20261015000000_initial_schema
DATABASE_URL="mysql://root:root@127.0.0.1:33306/${baseline_database}" \
  npx ts-node scripts/baseline-prisma-migrations.ts --confirm-current-schema-is-final
DATABASE_URL="mysql://root:root@127.0.0.1:33306/${baseline_database}" \
  npx prisma migrate status
record=$(docker compose -f docker-compose.local.yml exec -T mysql \
  mysql -uroot -proot -D "${baseline_database}" -N -e \
  "SELECT CONCAT(id, ':', title, ':', summary) FROM Diary WHERE id = 'baseline-diary'")
if [ "${record}" != "baseline-diary:Baseline diary:Existing data" ]; then
  printf 'Baseline changed or lost existing data: %s\n' "${record}" >&2
  exit 1
fi

printf 'Verified fresh deployment, legacy upgrade and guarded baseline adoption.\n'
