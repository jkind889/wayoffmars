import { backup, DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, writeFileSync, renameSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { dataDirectory, readAsset, storeAsset, digest } from '../src/lib/server/database.mjs';

const [operation, sourceArgument, targetArgument] = process.argv.slice(2);
if (!['backup', 'restore'].includes(operation) || !sourceArgument || (operation === 'restore' && !targetArgument)) throw new Error('Usage: npm run backup -- /new/backup OR npm run restore -- /backup /new/library');
const source = operation === 'backup' ? dataDirectory() : resolve(sourceArgument);
const target = resolve(operation === 'backup' ? sourceArgument : targetArgument);
if (existsSync(target)) throw new Error('Destination must not exist. Existing data is never overwritten.');
const staging = `${target}.pending-${randomUUID()}`;
mkdirSync(join(staging, 'assets'), { recursive: true, mode: 0o700 });
let db;
try {
  if (operation === 'restore') {
    const manifest = JSON.parse(readFileSync(join(source, 'manifest.json'), 'utf8'));
    if (manifest.format !== 'wayoffmars-library' || manifest.version !== 1 || digest(readFileSync(join(source, 'library.sqlite'))) !== manifest.databaseSha256) throw new Error('Backup manifest or database checksum is invalid.');
  }
  db = new DatabaseSync(join(source, 'library.sqlite'), { readOnly: true, timeout: 5000 });
  await backup(db, join(staging, 'library.sqlite')); db.close(); db = undefined;
  const snapshot = new DatabaseSync(join(staging, 'library.sqlite'), { readOnly: true });
  try {
    if (snapshot.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok' || snapshot.prepare('PRAGMA user_version').get().user_version !== 1) throw new Error('Database integrity or version check failed.');
    const assets = snapshot.prepare('SELECT DISTINCT asset FROM records WHERE asset IS NOT NULL').all();
    for (const { asset } of assets) storeAsset(staging, asset, readAsset(source, asset));
    writeFileSync(join(staging, 'manifest.json'), JSON.stringify({ format: 'wayoffmars-library', version: 1, createdAt: new Date().toISOString(), databaseSha256: digest(readFileSync(join(staging, 'library.sqlite'))), assets: assets.length }, null, 2), { mode: 0o600 });
  } finally { snapshot.close(); }
  renameSync(staging, target);
  console.log(`${operation} verified: ${target}`);
} catch (error) {
  console.error(`No completed backup/restore was published. Incomplete staging is at ${staging}.`); throw error;
} finally { db?.close(); }
