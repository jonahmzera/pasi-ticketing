// MongoDB connection. Set MONGODB_URI (e.g. MongoDB Atlas) for real use.
// Without it, an embedded MongoDB starts locally (data in ~/.pasi/mongo, outside any synced folder).
import mongoose from 'mongoose';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import os from 'node:os';
import { config } from './config.js';

let memory: { stop: () => Promise<unknown> } | null = null;

export async function connectDb() {
  let uri = config.mongoUri;
  if (!uri) {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    // Kept outside the project folder so cloud-sync tools (OneDrive, Dropbox) never touch live database files.
    const dbPath = process.env.LOCAL_DB_PATH || path.join(os.homedir(), '.pasi', 'mongo');
    mkdirSync(dbPath, { recursive: true });
    const m = await MongoMemoryServer.create({ instance: { dbPath, storageEngine: 'wiredTiger', port: 27999, launchTimeout: 90000 } });
    memory = m;
    uri = m.getUri('pasi');
    console.log(`[db] No MONGODB_URI set — using embedded MongoDB (data in ${dbPath})`);
  }
  await mongoose.connect(uri, { dbName: config.mongoUri ? undefined : 'pasi' });
  console.log('[db] connected');
}

export async function disconnectDb() {
  await mongoose.disconnect();
  await memory?.stop();
}
