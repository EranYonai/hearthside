# Backups

Backups are made only when the owner asks for one. **Settings → Backups → Download backup**
makes a fresh database dump, encrypts it with [age](https://age-encryption.org) to a
**public** key, and sends it straight to the owner's device. The server keeps no copy:
the dump is never written to disk.

The `backup` service in `compose.yml` does the dump. It sits on the internal database
network only, has no route to the internet, and answers only the web app.

The server only ever holds the public key. The private key that opens the backups lives
offline. Private fields inside the dump are also encrypted with the master key
([Encryption](encryption.md)), so a restore needs **both** keys: the backup key and the master
key current when the dump was taken.

Settings shows when the last backup was downloaded and reminds the owner after a week.

## Set up

1. On a trusted machine (not the server), make a key pair and keep `backup-key.txt` offline
   (password manager, printed copy):

   ```sh
   age-keygen -o backup-key.txt
   ```

2. Put the printed public key (`age1…`) in `.env` as `BACKUP_RECIPIENT=age1...`.

3. `docker compose up -d --build`, then download one backup from Settings to check it.

## Restore

Restore into an **empty** database (a fresh `db-data` volume), with the app stopped. Put
the downloaded file and your key next to `compose.yml`:

```sh
docker compose stop web worker
docker compose run --rm -u root \
  -v "$PWD/backup-key.txt:/key.txt:ro" -v "$PWD/hearthside-XXXX.dump.age:/backup.age:ro" \
  backup restore.sh /backup.age /key.txt
docker compose up -d
```

Make sure `secrets/encryption_key.txt` holds the master key from when the dump was taken.
Practise a restore once, on a spare machine, before you need it.
