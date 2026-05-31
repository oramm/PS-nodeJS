import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import mysql, { Connection, RowDataPacket } from 'mysql2/promise';
import Setup from '../setup/Setup';
import { loadEnv } from '../setup/loadEnv';

loadEnv();

const TRACKING_TABLE_NAME = 'SchemaMigrations';
const EXECUTABLE_MIGRATION_PATH = /^src\/.+\/migrations\/\d{3}_.+\.sql$/i;
const DOWN_MIGRATION_PATH = /_down\.sql$/i;

export type MigrationMode = 'list' | 'verify' | 'apply' | 'baseline';
export type MigrationStatusType = 'pending' | 'applied' | 'drift';

export interface RepoMigration {
    migrationName: string;
    absolutePath: string;
    checksum: string;
    sql: string;
}

export interface AppliedMigrationRecord {
    migrationName: string;
    checksum: string;
    appliedAt: string;
    appliedBy: string | null;
    gitSha: string | null;
    executionMillis: number | null;
}

export interface MigrationStatus {
    migration: RepoMigration;
    status: MigrationStatusType;
    dbRecord?: AppliedMigrationRecord;
}

export interface MigrationPlan {
    statuses: MigrationStatus[];
    dbOnlyRecords: AppliedMigrationRecord[];
    pendingCount: number;
    driftCount: number;
}

export interface RuntimeMigrationMetadata {
    appliedBy: string;
    gitSha: string | null;
}

interface DbMigrationRow extends RowDataPacket {
    MigrationName: string;
    Checksum: string;
    AppliedAt: Date | string;
    AppliedBy: string | null;
    GitSha: string | null;
    ExecutionMillis: number | null;
}

type TrackingConnection = Pick<Connection, 'query' | 'execute'>;

export function parseMode(args: string[]): MigrationMode {
    const candidate = (args[0] || '').trim().toLowerCase();
    if (
        candidate === 'list' ||
        candidate === 'verify' ||
        candidate === 'apply' ||
        candidate === 'baseline'
    ) {
        return candidate;
    }

    throw new Error(
        'Usage: node build/scripts/migrate.js <list|verify|apply|baseline>',
    );
}

export function assertExplicitNodeEnvForMutations(
    mode: MigrationMode,
    nodeEnv = process.env.NODE_ENV,
): void {
    if (mode !== 'apply' && mode !== 'baseline') {
        return;
    }

    if ((nodeEnv || '').trim().length > 0) {
        return;
    }

    throw new Error(
        `NODE_ENV must be explicitly set for migrate:${mode} to avoid writing to an unintended database target`,
    );
}

export function stripUtf8Bom(content: string): string {
    return content.replace(/^\uFEFF/, '');
}

export function normalizeSqlContent(content: string): string {
    return stripUtf8Bom(content).replace(/\r\n/g, '\n');
}

export function computeMigrationChecksum(content: string): string {
    return createHash('sha256')
        .update(normalizeSqlContent(content), 'utf8')
        .digest('hex');
}

export function normalizeRepoRelativePath(filePath: string): string {
    return filePath.replace(/\\/g, '/');
}

export function isDownMigrationPath(relativePath: string): boolean {
    return DOWN_MIGRATION_PATH.test(normalizeRepoRelativePath(relativePath));
}

export function isExecutableMigrationPath(relativePath: string): boolean {
    const normalizedPath = normalizeRepoRelativePath(relativePath);
    return (
        EXECUTABLE_MIGRATION_PATH.test(normalizedPath) &&
        !isDownMigrationPath(normalizedPath)
    );
}

function walkDirectory(directoryPath: string): string[] {
    const entries = fs.readdirSync(directoryPath, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
        const entryPath = path.join(directoryPath, entry.name);
        if (entry.isDirectory()) {
            files.push(...walkDirectory(entryPath));
            continue;
        }

        if (entry.isFile()) {
            files.push(entryPath);
        }
    }

    return files;
}

export function listMigrationFiles(repoRoot: string): string[] {
    const srcRoot = path.join(repoRoot, 'src');
    if (!fs.existsSync(srcRoot)) {
        throw new Error(`Missing src directory at ${srcRoot}`);
    }

    return walkDirectory(srcRoot)
        .map((absolutePath) =>
            normalizeRepoRelativePath(path.relative(repoRoot, absolutePath)),
        )
        .filter((relativePath) => relativePath.includes('/migrations/'))
        .filter((relativePath) => relativePath.toLowerCase().endsWith('.sql'))
        .sort((left, right) => left.localeCompare(right));
}

export function loadRepoMigrations(repoRoot: string): RepoMigration[] {
    const migrationFiles = listMigrationFiles(repoRoot);
    const invalidMigrationFiles = migrationFiles.filter(
        (relativePath) =>
            !isDownMigrationPath(relativePath) &&
            !isExecutableMigrationPath(relativePath),
    );

    if (invalidMigrationFiles.length > 0) {
        throw new Error(
            `Invalid migration filenames: ${invalidMigrationFiles.join(', ')}`,
        );
    }

    return migrationFiles
        .filter((relativePath) => isExecutableMigrationPath(relativePath))
        .map((relativePath) => {
            const absolutePath = path.join(repoRoot, relativePath);
            const sql = normalizeSqlContent(
                fs.readFileSync(absolutePath, 'utf8'),
            );

            return {
                migrationName: relativePath,
                absolutePath,
                sql,
                checksum: computeMigrationChecksum(sql),
            };
        });
}

function normalizeAppliedAt(value: Date | string): string {
    if (value instanceof Date) {
        return value.toISOString();
    }

    const normalized = new Date(value);
    if (!Number.isNaN(normalized.getTime())) {
        return normalized.toISOString();
    }

    return String(value);
}

export function buildMigrationPlan(
    repoMigrations: RepoMigration[],
    dbRecords: AppliedMigrationRecord[],
): MigrationPlan {
    const dbRecordsByName = new Map(
        dbRecords.map((record) => [record.migrationName, record]),
    );

    const statuses = repoMigrations.map((migration) => {
        const dbRecord = dbRecordsByName.get(migration.migrationName);

        if (!dbRecord) {
            return {
                migration,
                status: 'pending' as const,
            };
        }

        if (dbRecord.checksum !== migration.checksum) {
            return {
                migration,
                status: 'drift' as const,
                dbRecord,
            };
        }

        return {
            migration,
            status: 'applied' as const,
            dbRecord,
        };
    });

    const repoMigrationNames = new Set(
        repoMigrations.map((migration) => migration.migrationName),
    );
    const dbOnlyRecords = dbRecords.filter(
        (record) => !repoMigrationNames.has(record.migrationName),
    );

    return {
        statuses,
        dbOnlyRecords,
        pendingCount: statuses.filter((status) => status.status === 'pending')
            .length,
        driftCount: statuses.filter((status) => status.status === 'drift')
            .length,
    };
}

export function getVerificationErrors(plan: MigrationPlan): string[] {
    const errors: string[] = [];

    const pendingMigrations = plan.statuses.filter(
        (status) => status.status === 'pending',
    );
    if (pendingMigrations.length > 0) {
        errors.push(
            `Pending migrations: ${pendingMigrations
                .map((status) => status.migration.migrationName)
                .join(', ')}`,
        );
    }

    const driftedMigrations = plan.statuses.filter(
        (status) => status.status === 'drift',
    );
    if (driftedMigrations.length > 0) {
        errors.push(
            `Checksum drift: ${driftedMigrations
                .map((status) => status.migration.migrationName)
                .join(', ')}`,
        );
    }

    if (plan.dbOnlyRecords.length > 0) {
        errors.push(
            `DB-only migration records: ${plan.dbOnlyRecords
                .map((record) => record.migrationName)
                .join(', ')}`,
        );
    }

    return errors;
}

function resolveAppliedBy(): string {
    return (
        process.env.MIGRATION_APPLIED_BY ||
        process.env.HEROKU_APP_NAME ||
        process.env.USERNAME ||
        process.env.USER ||
        'unknown'
    );
}

function resolveGitSha(): string | null {
    const candidate =
        process.env.SOURCE_VERSION ||
        process.env.HEROKU_SLUG_COMMIT ||
        process.env.GIT_SHA ||
        process.env.APP_VERSION ||
        '';

    const normalized = candidate.trim();
    return normalized.length > 0 ? normalized : null;
}

function getRuntimeMetadata(): RuntimeMigrationMetadata {
    return {
        appliedBy: resolveAppliedBy(),
        gitSha: resolveGitSha(),
    };
}

function resolveRepoRoot(scriptDir: string): string {
    return path.resolve(scriptDir, '..', '..');
}

function buildMigrationConnectionOptions(): mysql.ConnectionOptions {
    return {
        ...Setup.dbConfig,
        multipleStatements: true,
    };
}

async function createMigrationConnection(): Promise<Connection> {
    return mysql.createConnection(buildMigrationConnectionOptions());
}

async function ensureTrackingTable(
    connection: TrackingConnection,
): Promise<void> {
    await connection.query(`
        CREATE TABLE IF NOT EXISTS ${TRACKING_TABLE_NAME} (
            Id INT AUTO_INCREMENT PRIMARY KEY,
            MigrationName VARCHAR(500) NOT NULL,
            Checksum VARCHAR(64) NOT NULL,
            AppliedAt DATETIME NOT NULL,
            AppliedBy VARCHAR(255) NULL,
            GitSha VARCHAR(64) NULL,
            ExecutionMillis INT NULL,
            UNIQUE KEY UQ_SchemaMigrations_MigrationName (MigrationName)
        )
    `);
}

export async function fetchAppliedMigrations(
    connection: TrackingConnection,
): Promise<AppliedMigrationRecord[]> {
    await ensureTrackingTable(connection);

    const [rows] = await connection.execute<DbMigrationRow[]>(`
        SELECT MigrationName, Checksum, AppliedAt, AppliedBy, GitSha, ExecutionMillis
        FROM ${TRACKING_TABLE_NAME}
        ORDER BY MigrationName
    `);

    return rows.map((row) => ({
        migrationName: row.MigrationName,
        checksum: row.Checksum,
        appliedAt: normalizeAppliedAt(row.AppliedAt),
        appliedBy: row.AppliedBy,
        gitSha: row.GitSha,
        executionMillis: row.ExecutionMillis,
    }));
}

async function insertTrackingRow(
    connection: TrackingConnection,
    migration: RepoMigration,
    metadata: RuntimeMigrationMetadata,
    executionMillis: number | null,
): Promise<void> {
    await connection.execute(
        `
            INSERT INTO ${TRACKING_TABLE_NAME}
                (MigrationName, Checksum, AppliedAt, AppliedBy, GitSha, ExecutionMillis)
            VALUES (?, ?, ?, ?, ?, ?)
        `,
        [
            migration.migrationName,
            migration.checksum,
            new Date(),
            metadata.appliedBy,
            metadata.gitSha,
            executionMillis,
        ],
    );
}

export async function applyPendingMigrations(
    connection: TrackingConnection,
    plan: MigrationPlan,
    metadata: RuntimeMigrationMetadata,
): Promise<string[]> {
    const appliedMigrationNames: string[] = [];

    for (const status of plan.statuses) {
        if (status.status !== 'pending') {
            continue;
        }

        const startedAt = Date.now();
        await connection.query(status.migration.sql);
        await insertTrackingRow(
            connection,
            status.migration,
            metadata,
            Date.now() - startedAt,
        );
        appliedMigrationNames.push(status.migration.migrationName);
    }

    return appliedMigrationNames;
}

export async function baselinePendingMigrations(
    connection: TrackingConnection,
    plan: MigrationPlan,
    metadata: RuntimeMigrationMetadata,
): Promise<string[]> {
    const baselinedMigrationNames: string[] = [];

    for (const status of plan.statuses) {
        if (status.status !== 'pending') {
            continue;
        }

        await insertTrackingRow(connection, status.migration, metadata, null);
        baselinedMigrationNames.push(status.migration.migrationName);
    }

    return baselinedMigrationNames;
}

function formatStatusLine(status: MigrationStatus): string {
    const label = status.status.toUpperCase().padEnd(7, ' ');
    const appliedAt = status.dbRecord
        ? ` | appliedAt=${status.dbRecord.appliedAt}`
        : '';
    const executionMillis =
        status.dbRecord?.executionMillis !== null &&
        status.dbRecord?.executionMillis !== undefined
            ? ` | executionMillis=${status.dbRecord.executionMillis}`
            : '';
    return `[${label}] ${status.migration.migrationName}${appliedAt}${executionMillis}`;
}

function printPlan(plan: MigrationPlan): void {
    console.log(
        `[migrate] repo=${plan.statuses.length} pending=${plan.pendingCount} drift=${plan.driftCount}`,
    );

    for (const status of plan.statuses) {
        console.log(formatStatusLine(status));
    }

    if (plan.dbOnlyRecords.length > 0) {
        console.warn(
            '[migrate] DB-only migration records not present in repo:',
        );
        for (const record of plan.dbOnlyRecords) {
            console.warn(`[DB_ONLY] ${record.migrationName}`);
        }
    }
}

async function loadPlan(
    connection: TrackingConnection,
    repoRoot: string,
): Promise<MigrationPlan> {
    const repoMigrations = loadRepoMigrations(repoRoot);
    const appliedMigrations = await fetchAppliedMigrations(connection);
    return buildMigrationPlan(repoMigrations, appliedMigrations);
}

function assertVerifyPasses(plan: MigrationPlan): void {
    const errors = getVerificationErrors(plan);
    if (errors.length > 0) {
        throw new Error(errors.join(' | '));
    }
}

export async function runMigrationCommand(
    mode: MigrationMode,
    repoRoot = resolveRepoRoot(__dirname),
): Promise<MigrationPlan> {
    assertExplicitNodeEnvForMutations(mode);

    const env = process.env.NODE_ENV || 'production';
    const dbHost = process.env.DB_HOST || '';
    const dbName = process.env.DB_NAME || '';

    if (!dbHost || !dbName) {
        throw new Error('DB_HOST or DB_NAME is not configured');
    }

    console.log(`[migrate] mode=${mode} env=${env} db=${dbHost}/${dbName}`);

    const connection = await createMigrationConnection();

    try {
        const initialPlan = await loadPlan(connection, repoRoot);
        printPlan(initialPlan);

        if (mode === 'list') {
            return initialPlan;
        }

        if (mode === 'verify') {
            assertVerifyPasses(initialPlan);
            console.log('[migrate] verify passed');
            return initialPlan;
        }

        if (initialPlan.driftCount > 0) {
            throw new Error(
                'Checksum drift detected. Resolve drift before apply/baseline.',
            );
        }

        if (mode === 'apply') {
            const appliedMigrationNames = await applyPendingMigrations(
                connection,
                initialPlan,
                getRuntimeMetadata(),
            );

            console.log(
                `[migrate] applied=${appliedMigrationNames.length} ${appliedMigrationNames.join(', ')}`,
            );
        }

        if (mode === 'baseline') {
            const baselinedMigrationNames = await baselinePendingMigrations(
                connection,
                initialPlan,
                getRuntimeMetadata(),
            );

            console.log(
                `[migrate] baselined=${baselinedMigrationNames.length} ${baselinedMigrationNames.join(', ')}`,
            );
        }

        const finalPlan = await loadPlan(connection, repoRoot);
        printPlan(finalPlan);
        return finalPlan;
    } finally {
        await connection.end();
    }
}

if (require.main === module) {
    runMigrationCommand(parseMode(process.argv.slice(2))).catch((error) => {
        console.error('[migrate] failed:', error);
        process.exit(1);
    });
}
