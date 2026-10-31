# Encryption

Private fields are encrypted by the app before they reach Postgres, so a database dump, a
stray `psql` session or a leaked backup shows ciphertext only. Disk and backup encryption
still apply on top of this.

## What is encrypted

| Table                     | Encrypted                                                             | Keyed hash (lookups)           |
| ------------------------- | --------------------------------------------------------------------- | ------------------------------ |
| `households`              | `name`, `invest_settings`                                             |                                |
| `members`                 | `name`                                                                |                                |
| `passkeys`                | `name`                                                                |                                |
| `auth_challenges`         | `payload`                                                             |                                |
| `audit_log`               | `detail`, `ip`                                                        | `ip_hash` (rate limits)        |
| `accounts`                | `name`, `provider`, `network`, `last4`                                |                                |
| `import_batches`          | `file_name`                                                           | `file_hash` (same file twice)  |
| `transactions`            | `description`, `amount_minor`, `original_minor`, `reference`, `notes` | `description_key`, `dedup_key` |
| `category_rules`          |                                                                       | `match`                        |
| `household_categories`    | `label`, `keywords`                                                   | `label_key` (unique names)     |
| `investment_accounts`     | `name`, `provider`                                                    |                                |
| `instruments`             | `symbol`, `name`, `quote_symbol`, `prev_close`, `facts`               | `symbol_key`                   |
| `holdings`                | `units`, `cost_minor`                                                 |                                |
| `instrument_prices`       | `price`                                                               |                                |
| `investment_transactions` | `units`, `amount_minor`                                               | `dedup_key`                    |
| `portfolio_snapshots`     | `value_minor`                                                         |                                |

Left in the clear because queries need them and they say little alone: ids, roles, dates,
currencies, account kind and visibility, categories, installment numbers, asset classes,
instrument and transaction kinds, and timestamps.

## How it works

- **Master key.** 32 random bytes, base64, in `secrets/encryption_key.txt` (a Compose secret
  mounted at `ENCRYPTION_KEY_FILE`). It never enters the database, the image or the repo. For
  development and tests, `ENCRYPTION_KEY` can hold it directly.
- **Data keys.** Random keys stored in `encryption_keys`, each wrapped (AES-256-GCM) by the
  master key. A `data` key seals values; one `index` key computes the keyed hashes.
- **Values** are sealed with AES-256-GCM, a fresh IV each time, and the `table.column` name as
  associated data, so a value copied into another column won't decrypt. Stored as
  `hs1:<data key id>:<base64url>`.
- **Lookups** use HMAC-SHA-256 under the index key (`hb1:<base64url>`): duplicate detection,
  category rules and rate limits match on these. Equal inputs give equal hashes, so these
  columns reveal which rows share a value, never the value.
- Encrypted columns can't be searched, sorted or summed in SQL. Search and totals run in the
  app after reading (a month of records at a time).
- In code, the columns in `packages/db/src/schema.ts` built with `encText`, `encInt` and
  `encJson` encrypt and decrypt on their own. Lookups go through `blindIndex()`. A new private
  column must use one of these and be added to `ENCRYPTED_COLUMNS` or `BLIND_COLUMNS` in
  `packages/db/src/keys.ts`.

On every start, after migrations, the app unwraps its keys (creating them on first start)
and seals any value not yet under the active data key. That is how existing plaintext rows
were encrypted when this was introduced, and how rotation finishes. Without a valid master
key the app refuses to start.

## Back up the master key

Lose it and the data is gone. Keep a copy offline, apart from the database backups (a backup
plus its key is the whole household). Restoring a backup needs the master key that was current
when the backup was taken.

## Rotating the master key

Do this if the key may have leaked, or on a schedule.

1. Put a new key on the first line of `secrets/encryption_key.txt`, keeping the old one below
   it:

   ```sh
   (umask 077 && { openssl rand -base64 32; cat secrets/encryption_key.txt; } > secrets/key.new \
     && mv secrets/key.new secrets/encryption_key.txt)
   ```

2. Restart the web app (`pnpm stack`). On start it rewraps every data key under the new master
   key, creates a new data key and re-encrypts all values with it. The log line
   `encryption ready` reports `rewrapped` and `encrypted` counts.
3. Remove the old key (the second line) from the file and restart again. Back up the new key
   offline.

Older data keys stay in `encryption_keys`, wrapped by the new master key and marked retired;
values sealed with them are re-encrypted in step 2, so a leaked old master key alone opens
nothing current.

The index key is not rotated by this, so keyed hashes and lookups keep working without a
rebuild. Rotating it would mean recomputing every hash from decrypted values; that isn't
needed unless the index key itself is exposed.
