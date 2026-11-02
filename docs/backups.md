# Backups

The `backup` service in `compose.yml` dumps the database once a night, encrypts the dump
with [age](https://age-encryption.org) to a **public** key, and keeps the last 14 days in the
`backups` volume. It can also copy each dump to offsite storage. The owner sees the last
run under **Settings → Backups**.

The server only ever holds the public key. The private key that decrypts the dumps lives
offline, so a stolen server or a leaked dump reveals nothing. Private fields inside the dump
are also encrypted with the master key ([Encryption](encryption.md)), so a restore needs
**both** keys: the backup key and the master key current when the dump was taken.

## Set up

1. On a trusted machine (not the server), make a key pair and keep `backup-key.txt` offline
   (password manager, printed copy):

   ```sh
   age-keygen -o backup-key.txt
   ```

2. Put the printed public key (`age1…`) in `.env`:

   ```sh
   BACKUP_RECIPIENT=age1...
   # Optional: when to run (container local time) and how many days to keep.
   BACKUP_AT=03:00
   TZ=UTC
   BACKUP_KEEP_DAYS=14
   ```

3. Optional offsite copy. Any [rclone](https://rclone.org) remote works, set up with
   environment variables in `secrets/backup.env` (only the backup container reads it). For
   an S3-compatible bucket:

   ```sh
   RCLONE_CONFIG_OFFSITE_TYPE=s3
   RCLONE_CONFIG_OFFSITE_PROVIDER=Other
   RCLONE_CONFIG_OFFSITE_ENDPOINT=https://...
   RCLONE_CONFIG_OFFSITE_ACCESS_KEY_ID=...
   RCLONE_CONFIG_OFFSITE_SECRET_ACCESS_KEY=...
   ```

   and in `.env`: `BACKUP_REMOTE=offsite:<bucket>/hearthside`. Give the key write access to
   that bucket only. Set a lifecycle rule on the bucket to expire old dumps.

4. `docker compose up -d --build backup`, then take one right away to check it:

   ```sh
   docker compose exec backup backup.sh --now
   ```

## Restore

Restore into an **empty** database (a fresh `db-data` volume), with the app stopped:

```sh
docker compose stop web worker
docker compose run --rm -u root -v "$PWD/backup-key.txt:/key.txt:ro" backup \
  restore.sh /backups/hearthside-YYYYMMDD-HHMMSS.dump.age /key.txt
docker compose up -d
```

For a dump from offsite storage, copy it into the volume first
(`docker compose cp <file> backup:/backups/`). Make sure `secrets/encryption_key.txt` holds
the master key from when the dump was taken. Practise a restore once, on a spare machine,
before you need it.
