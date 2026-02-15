import { loadEnv } from '../src/setup/loadEnv';

async function main() {
    loadEnv();
    const { default: ToolsDb } = await import('../src/tools/ToolsDb');

    const dbName = process.env.DB_NAME;
    const table = 'ContractMeetingNotes';

    const tableRows = (await ToolsDb.getQueryCallbackAsync(
        `SELECT TABLE_NAME
         FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
        undefined,
        [dbName, table]
    )) as any[];

    const indexRows = (await ToolsDb.getQueryCallbackAsync(
        `SELECT INDEX_NAME, NON_UNIQUE,
                GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS ColumnsList
         FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
         GROUP BY INDEX_NAME, NON_UNIQUE
         ORDER BY INDEX_NAME`,
        undefined,
        [dbName, table]
    )) as any[];

    const fkRows = (await ToolsDb.getQueryCallbackAsync(
        `SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
         FROM information_schema.KEY_COLUMN_USAGE
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL
         ORDER BY CONSTRAINT_NAME, ORDINAL_POSITION`,
        undefined,
        [dbName, table]
    )) as any[];

    console.log(
        JSON.stringify(
            {
                env: process.env.NODE_ENV || 'production',
                dbHost: process.env.DB_HOST,
                dbName,
                tableExists: tableRows.length > 0,
                indexes: indexRows,
                foreignKeys: fkRows,
            },
            null,
            2
        )
    );

    await ToolsDb.pool.end();
}

main().catch(async (error) => {
    console.error('DB_VERIFY_ERROR', error?.message || error);
    try {
        const { default: ToolsDb } = await import('../src/tools/ToolsDb');
        await ToolsDb.pool.end();
    } catch {}
    process.exit(1);
});
