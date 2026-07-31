# MongoDB to SQLite migration

OTRUST no longer needs a database server. The application stores its state in
one SQLite file configured by `OTRUST_DB_PATH`.

## 1. Stop writes

Put the old instance in maintenance mode or stop it before the final export.
This prevents records from being created after the export starts.

## 2. Export each collection

Create an empty directory and export every collection as newline-delimited
Extended JSON. Keep the collection name as the filename.

```bash
mkdir -p mongo-export
for collection in $(mongosh "$MONGODB_URL" --quiet --eval \
  'db.getCollectionNames().join(" ")'); do
  mongoexport --uri "$MONGODB_URL" --collection "$collection" \
    --out "mongo-export/$collection.json"
done
```

Use credentials with read-only access. Do not commit the export files; they can
contain email addresses, API-key hashes, signing files, and other private data.

## 3. Validate and import

The destination must not already exist. The importer writes to a temporary
file and renames it only after every collection succeeds.

On Railway, production startup refuses to create an empty SQLite file by
default. Upload the migrated database to the mounted volume before deploying
the SQLite release. `OTRUST_ALLOW_EMPTY_DB=true` is only for a deliberately
new installation with no records to migrate.

```bash
npm run migrate:mongodb-export -- \
  --source ./mongo-export \
  --db ./data/otrust.sqlite \
  --dry-run

npm run migrate:mongodb-export -- \
  --source ./mongo-export \
  --db ./data/otrust.sqlite
```

## 4. Start and verify

```bash
OTRUST_DB_PATH=./data/otrust.sqlite npm start
curl -fsS http://localhost:3000/health
```

Verify representative timestamp receipts, proofs, signing requests, platform
organizations, and API keys before deleting the old database service. Keep the
original export in encrypted backup until the new deployment has been observed
through at least one backup and restore cycle.
