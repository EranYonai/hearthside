#!/bin/sh
# Restore a backup into an EMPTY database. Run from the backup container:
#   docker compose run --rm -u root -v /path/to/key.txt:/key.txt:ro -v /path/to/file:/backup.age:ro \
#     backup restore.sh /backup.age /key.txt
# The private key is the one kept offline; it never stays on the server.
set -eu
file=$1
key=$2
export PGPASSWORD
PGPASSWORD=$(cat "${DATABASE_PASSWORD_FILE:-/run/secrets/db_password}")
age -d -i "$key" "$file" |
  pg_restore -h "${PGHOST:-db}" -U "${PGUSER:-hearthside}" -d "${PGDATABASE:-hearthside}" \
    --no-owner --exit-on-error
echo "Restored $file"
