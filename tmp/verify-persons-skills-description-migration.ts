import { loadEnv } from '../src/setup/loadEnv';

async function main() {
    loadEnv();
    const { default: ToolsDb } = await import('../src/tools/ToolsDb');

    const dbName = process.env.DB_NAME;

    const rows = (await ToolsDb.getQueryCallbackAsync(
        `SELECT COLUMN_NAME, IS_NULLABLE, DATA_TYPE
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ?
           AND TABLE_NAME = 'SkillsDictionary'
           AND COLUMN_NAME = 'Description'`,
        undefined,
        [dbName],
    )) as any[];

    console.log(
        JSON.stringify(
            {
                env: process.env.NODE_ENV || 'production',
                dbHost: process.env.DB_HOST,
                dbName,
                hasDescriptionColumn: rows.length > 0,
                column: rows[0] || null,
            },
            null,
            2,
        ),
    );

    await ToolsDb.pool.end();
}

main().catch(async (error) => {
    console.error('DB_VERIFY_ERROR', (error as any)?.message || error);
    try {
        const { default: ToolsDb } = await import('../src/tools/ToolsDb');
        await ToolsDb.pool.end();
    } catch {}
    process.exit(1);
});
