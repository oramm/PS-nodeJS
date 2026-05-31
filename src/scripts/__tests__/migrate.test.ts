import { describe, expect, it } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
    applyPendingMigrations,
    assertExplicitNodeEnvForMutations,
    baselinePendingMigrations,
    buildMigrationPlan,
    computeMigrationChecksum,
    getVerificationErrors,
    isExecutableMigrationPath,
    listMigrationFiles,
    loadRepoMigrations,
    normalizeSqlContent,
    RepoMigration,
} from '../migrate';

class FakeTrackingConnection {
    appliedRecords: Array<{
        migrationName: string;
        checksum: string;
        appliedAt: string;
        appliedBy: string | null;
        gitSha: string | null;
        executionMillis: number | null;
    }> = [];

    executedSql: string[] = [];

    async query(sql: string): Promise<[unknown[], unknown]> {
        this.executedSql.push(sql);
        return [[], undefined];
    }

    async execute(
        sql: string,
        params: any[] = [],
    ): Promise<[unknown, unknown]> {
        if (sql.includes('INSERT INTO SchemaMigrations')) {
            this.appliedRecords.push({
                migrationName: String(params[0]),
                checksum: String(params[1]),
                appliedAt: new Date(params[2]).toISOString(),
                appliedBy: (params[3] as string | null) || null,
                gitSha: (params[4] as string | null) || null,
                executionMillis:
                    params[5] === null ? null : Number(params[5] as number),
            });
        }

        return [{}, undefined];
    }
}

function createRepoMigration(
    migrationName: string,
    sql: string,
): RepoMigration {
    return {
        migrationName,
        absolutePath: path.join('repo', migrationName),
        sql,
        checksum: computeMigrationChecksum(sql),
    };
}

function createTempRepo(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'ps-migrate-'));
}

describe('migrate runner helpers', () => {
    it('requires explicit NODE_ENV for mutating modes', () => {
        expect(() => assertExplicitNodeEnvForMutations('apply', '')).toThrow(
            'NODE_ENV must be explicitly set for migrate:apply',
        );
        expect(() => assertExplicitNodeEnvForMutations('baseline', '')).toThrow(
            'NODE_ENV must be explicitly set for migrate:baseline',
        );
        expect(() => assertExplicitNodeEnvForMutations('verify', '')).not.toThrow();
        expect(() => assertExplicitNodeEnvForMutations('apply', 'development')).not.toThrow();
    });

    it('normalizes SQL content by stripping BOM and CRLF', () => {
        expect(normalizeSqlContent('\uFEFFSELECT 1;\r\nSELECT 2;')).toBe(
            'SELECT 1;\nSELECT 2;',
        );
    });

    it('ignores *_down.sql and keeps executable migration files sorted', () => {
        const repoRoot = createTempRepo();
        fs.mkdirSync(path.join(repoRoot, 'src', 'costInvoices', 'migrations'), {
            recursive: true,
        });
        fs.writeFileSync(
            path.join(
                repoRoot,
                'src',
                'costInvoices',
                'migrations',
                '002_add_payment_and_bank_down.sql',
            ),
            'ALTER TABLE CostInvoices DROP COLUMN SupplierBankAccount;',
            'utf8',
        );
        fs.writeFileSync(
            path.join(
                repoRoot,
                'src',
                'costInvoices',
                'migrations',
                '001_create_cost_invoices.sql',
            ),
            '\uFEFFCREATE TABLE CostInvoices (Id INT);',
            'utf8',
        );

        expect(listMigrationFiles(repoRoot)).toEqual([
            'src/costInvoices/migrations/001_create_cost_invoices.sql',
            'src/costInvoices/migrations/002_add_payment_and_bank_down.sql',
        ]);
        expect(
            isExecutableMigrationPath(
                'src/costInvoices/migrations/002_add_payment_and_bank_down.sql',
            ),
        ).toBe(false);

        const repoMigrations = loadRepoMigrations(repoRoot);
        expect(
            repoMigrations.map((migration) => migration.migrationName),
        ).toEqual(['src/costInvoices/migrations/001_create_cost_invoices.sql']);
        expect(repoMigrations[0].sql.startsWith('CREATE TABLE')).toBe(true);
    });

    it('detects pending migrations and checksum drift', () => {
        const first = createRepoMigration(
            'src/invoices/migrations/001_add_invoice_correction_columns.sql',
            'ALTER TABLE Invoices ADD COLUMN CorrectionType VARCHAR(32);',
        );
        const second = createRepoMigration(
            'src/invoices/migrations/002_add_invoice_jst_gv_flags.sql',
            'ALTER TABLE Invoices ADD COLUMN IsJstSubordinate TINYINT(1);',
        );

        const plan = buildMigrationPlan(
            [first, second],
            [
                {
                    migrationName: first.migrationName,
                    checksum: 'drifted-checksum',
                    appliedAt: '2026-05-09T00:00:00.000Z',
                    appliedBy: 'tester',
                    gitSha: 'abc123',
                    executionMillis: 7,
                },
            ],
        );

        expect(plan.pendingCount).toBe(1);
        expect(plan.driftCount).toBe(1);
        expect(getVerificationErrors(plan)).toEqual([
            `Pending migrations: ${second.migrationName}`,
            `Checksum drift: ${first.migrationName}`,
        ]);
    });

    it('treats DB-only migration records as verify failures', () => {
        const repoMigrations = [
            createRepoMigration(
                'src/contracts/milestones/migrations/001_allow_null_milestone_dates.sql',
                'ALTER TABLE Milestones MODIFY COLUMN StartDate DATE NULL;',
            ),
        ];

        const plan = buildMigrationPlan(repoMigrations, [
            {
                migrationName:
                    'src/contracts/milestones/migrations/000_removed_legacy_migration.sql',
                checksum: 'legacy-checksum',
                appliedAt: '2026-05-09T00:00:00.000Z',
                appliedBy: 'tester',
                gitSha: 'abc123',
                executionMillis: 4,
            },
        ]);

        expect(getVerificationErrors(plan)).toEqual([
            'Pending migrations: src/contracts/milestones/migrations/001_allow_null_milestone_dates.sql',
            'DB-only migration records: src/contracts/milestones/migrations/000_removed_legacy_migration.sql',
        ]);
    });

    it('apply executes only pending migrations once and records tracking rows', async () => {
        const connection = new FakeTrackingConnection();
        const repoMigrations = [
            createRepoMigration(
                'src/persons/migrations/001_create_persons_v2_schema.sql',
                'CREATE TABLE PersonsV2 (Id INT);',
            ),
            createRepoMigration(
                'src/persons/migrations/002_backfill_persons_v2.sql',
                'INSERT INTO PersonsV2 (Id) VALUES (1);',
            ),
        ];

        const initialPlan = buildMigrationPlan(repoMigrations, []);
        const applied = await applyPendingMigrations(
            connection as any,
            initialPlan,
            {
                appliedBy: 'tester',
                gitSha: 'sha-1',
            },
        );

        expect(applied).toEqual([
            'src/persons/migrations/001_create_persons_v2_schema.sql',
            'src/persons/migrations/002_backfill_persons_v2.sql',
        ]);
        expect(connection.executedSql).toEqual([
            'CREATE TABLE PersonsV2 (Id INT);',
            'INSERT INTO PersonsV2 (Id) VALUES (1);',
        ]);
        expect(connection.appliedRecords).toHaveLength(2);
        expect(
            connection.appliedRecords.every(
                (record) => record.executionMillis !== null,
            ),
        ).toBe(true);

        const reappliedPlan = buildMigrationPlan(
            repoMigrations,
            connection.appliedRecords,
        );
        const reapplied = await applyPendingMigrations(
            connection as any,
            reappliedPlan,
            {
                appliedBy: 'tester',
                gitSha: 'sha-1',
            },
        );

        expect(reapplied).toEqual([]);
        expect(connection.executedSql).toHaveLength(2);
    });

    it('baseline tracks pending migrations without executing SQL', async () => {
        const connection = new FakeTrackingConnection();
        const repoMigrations = [
            createRepoMigration(
                'src/meetings/meetingArrangements/migrations/002_add_status_to_meeting_arrangements.sql',
                'ALTER TABLE MeetingArrangements ADD COLUMN Status VARCHAR(32);',
            ),
        ];
        const plan = buildMigrationPlan(repoMigrations, []);

        const baselined = await baselinePendingMigrations(
            connection as any,
            plan,
            {
                appliedBy: 'tester',
                gitSha: 'sha-2',
            },
        );

        expect(baselined).toEqual([
            'src/meetings/meetingArrangements/migrations/002_add_status_to_meeting_arrangements.sql',
        ]);
        expect(connection.executedSql).toEqual([]);
        expect(connection.appliedRecords).toHaveLength(1);
        expect(connection.appliedRecords[0].executionMillis).toBeNull();
    });
});
