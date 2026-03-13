import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import { loadEnv } from '../src/setup/loadEnv';

loadEnv();

const host = process.env.DB_HOST;
const database = process.env.DB_NAME;
const env = process.env.NODE_ENV || 'production';

if (!host || !database) {
  throw new Error('DB_HOST or DB_NAME is not configured');
}

const migrationSqlPath = path.resolve(
  __dirname,
  '../src/contracts/milestones/migrations/001_allow_null_milestone_dates.sql',
);

async function logColumnState(stage: string, connection: mysql.Connection) {
  const [rows] = await connection.execute<mysql.RowDataPacket[]>(
    `SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_TYPE
     FROM information_schema.columns
     WHERE table_schema = ? AND table_name = 'Milestones' AND COLUMN_NAME IN ('StartDate','EndDate')
     ORDER BY COLUMN_NAME`,
    [database],
  );

  console.log(`[MIGRATION][${stage}] Milestones column state:`);
  if (rows.length === 0) {
    console.log(`[MIGRATION][${stage}] columns StartDate/EndDate not found`);
    return;
  }
  for (const column of rows) {
    console.log(
      `[MIGRATION][${stage}] ${column.COLUMN_NAME}: type=${column.COLUMN_TYPE} nullable=${column.IS_NULLABLE}`,
    );
  }
}

async function main() {
  console.log(
    `[MIGRATION] env=${env} target=${host}/${database} file=${migrationSqlPath}`,
  );

  const sqlContent = fs.readFileSync(migrationSqlPath, 'utf8').replace(
    /^\uFEFF/,
    '',
  );

  const connection = await mysql.createConnection({
    host,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database,
    multipleStatements: true,
  });

  try {
    await logColumnState('pre', connection);
    await connection.query(sqlContent);
    console.log('[MIGRATION] Applied milestone dates migration.');
    await logColumnState('post', connection);
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error('[MIGRATION] Execution failed:', err);
  process.exit(1);
});
