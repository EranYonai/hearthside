#!/bin/sh
# Nightly database backup. Dumps the database, encrypts it to a public key (the
# matching private key never lives on the server), keeps a few days locally and,
# when a remote is set up, copies it offsite. Writes status.json for the app.
#
#   backup.sh          run forever, once a night at BACKUP_AT (default 03:00)
#   backup.sh --now    one backup, then exit
set -eu

DIR=${BACKUP_DIR:-/backups}
AT=${BACKUP_AT:-03:00}
KEEP_DAYS=${BACKUP_KEEP_DAYS:-14}
REMOTE=${BACKUP_REMOTE:-}

log() { printf '{"level":"%s","msg":"%s","time":"%s"}\n' "$1" "$2" "$(date -u +%FT%TZ)"; }

status() { # ok file bytes offsite error
  tmp="$DIR/.status.json.tmp"
  printf '{"at":"%s","ok":%s,"file":"%s","bytes":%s,"offsite":%s,"error":"%s"}\n' \
    "$(date -u +%FT%TZ)" "$1" "$2" "$3" "$4" "$5" >"$tmp"
  mv "$tmp" "$DIR/status.json"
}

run() {
  if [ -z "${BACKUP_RECIPIENT:-}" ]; then
    log error "BACKUP_RECIPIENT is not set; no backup taken"
    status false "" 0 false "No backup key set"
    return 1
  fi
  name="hearthside-$(date -u +%Y%m%d-%H%M%S).dump.age"
  part="$DIR/.$name.part"
  export PGPASSWORD
  PGPASSWORD=$(cat "${DATABASE_PASSWORD_FILE:-/run/secrets/db_password}")
  if ! pg_dump -h "${PGHOST:-db}" -U "${PGUSER:-hearthside}" -d "${PGDATABASE:-hearthside}" \
    --format=custom --no-owner | age -r "$BACKUP_RECIPIENT" -o "$part"; then
    rm -f "$part"
    log error "dump failed"
    status false "" 0 false "The dump failed"
    return 1
  fi
  mv "$part" "$DIR/$name"
  bytes=$(wc -c <"$DIR/$name" | tr -d ' ')
  find "$DIR" -maxdepth 1 -name 'hearthside-*.dump.age' -mtime +"$KEEP_DAYS" -delete
  offsite=false
  if [ -n "$REMOTE" ]; then
    if rclone copy --no-traverse "$DIR/$name" "$REMOTE" >/dev/null 2>&1; then
      offsite=true
    else
      log error "offsite copy failed"
      status false "$name" "$bytes" false "Saved here, but the offsite copy failed"
      return 1
    fi
  fi
  status true "$name" "$bytes" "$offsite" ""
  log info "backup saved"
}

seconds_until() { # HH:MM, local time (TZ)
  now=$(date +%s)
  next=$(date -d "today $1" +%s)
  [ "$next" -le "$now" ] && next=$(date -d "tomorrow $1" +%s)
  echo $((next - now))
}

if [ "${1:-}" = "--now" ]; then
  run
  exit $?
fi

log info "backups scheduled daily at $AT"
while true; do
  sleep "$(seconds_until "$AT")"
  run || true
done
