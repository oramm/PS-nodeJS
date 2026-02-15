import { readFile } from 'fs/promises';
import path from 'path';
import mysql from 'mysql2/promise';
import { loadEnv } from '../src/setup/loadEnv';

async function main() {
    loadEnv();

    const migrationPath = path.resolve(
        process.cwd(),
        'src/contractMeetingNotes/migrations/001_create_contract_meeting_notes.sql'
    );
    const sql = await readFile(migrationPath, 'utf8');

    const host = process.env.DB_HOST;
    const user = process.env.DB_USER;
    const password = process.env.DB_PASSWORD;
    const database = process.env.DB_NAME;

    if (!host || !user || password === undefined || !database) {
        throw new Error(
            'Missing DB connection env vars (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME)'
        );
    }

    const conn = await mysql.createConnection({
        host,
        user,
        password,
        database,
        multipleStatements: true,
    });

    try {
        await conn.query(sql);
        console.log(
            JSON.stringify(
                {
                    status: 'ok',
                    migration: '001_create_contract_meeting_notes.sql',
                    dbHost: host,
                    dbName: database,
                },
                null,
                2
            )
        );
    } finally {
        await conn.end();
    }
}

main().catch((error: any) => {
    console.error('DB_MIGRATION_ERROR', error?.message || error);
    process.exit(1);
});
