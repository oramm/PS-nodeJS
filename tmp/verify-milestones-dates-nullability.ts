import mysql from 'mysql2/promise';
import { loadEnv } from '../src/setup/loadEnv';

loadEnv();

const schema = process.env.DB_NAME;
const host = process.env.DB_HOST;
const env = process.env.NODE_ENV || 'production';

if (!schema || !host) {
  throw new Error('DB_HOST or DB_NAME is not configured');
}

async function main() {
  console.log(`[VERIFY] env=${env} host=${host}/${schema}`);
  const connection = await mysql.createConnection({
    host,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: 'information_schema',
  });

  try {
    const [tableInfo] = await connection.execute<mysql.RowDataPacket[]>(
      'SELECT COUNT(1) AS cnt FROM tables WHERE table_schema = ? AND table_name = ?',
      [schema, 'Milestones'],
    );
    const exists = tableInfo[0]?.cnt > 0;
    console.log(`[VERIFY] Milestones table present: ${exists}`);

    if (!exists) {
      console.log('[VERIFY] Skipping column check because Milestones table is missing');
      return;
    }

    const [columns] = await connection.execute<mysql.RowDataPacket[]>(
      `SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_TYPE
       FROM columns
       WHERE table_schema = ? AND table_name = 'Milestones' AND COLUMN_NAME IN ('StartDate','EndDate')
       ORDER BY COLUMN_NAME`,
      [schema],
    );

    if (columns.length === 0) {
      console.log('[VERIFY] Columns StartDate/EndDate not found');
      return;
    }

    for (const column of columns) {
      console.log(
        `[VERIFY] ${column.COLUMN_NAME}: type=${column.COLUMN_TYPE} nullable=${column.IS_NULLABLE}`,
      );
    }
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error('[VERIFY] Migration verification failed:', err);
  process.exit(1);
});
