import { loadEnv } from '../src/setup/loadEnv';
loadEnv();
const u = process.env.DB_USER ?? '<undefined>';
const p = process.env.DB_PASSWORD ?? '<undefined>';
console.log('DB_USER_LEN=' + u.length);
console.log('DB_USER_TRIM_LEN=' + u.trim().length);
console.log('DB_USER_JSON=' + JSON.stringify(u));
console.log('DB_PASSWORD_LEN=' + p.length);
console.log('DB_PASSWORD_TRIM_LEN=' + p.trim().length);
