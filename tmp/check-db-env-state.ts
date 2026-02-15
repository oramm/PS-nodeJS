import { loadEnv } from '../src/setup/loadEnv';

loadEnv();
const keys = ['NODE_ENV','DB_HOST','DB_NAME','DB_USER','DB_PASSWORD'];
for (const k of keys) {
  const v = process.env[k];
  const state = v === undefined ? 'UNDEFINED' : (v === '' ? 'EMPTY' : 'SET');
  console.log(`${k}=${state}`);
}
