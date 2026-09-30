import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

const sql = (path: string) =>
    readFileSync(join(__dirname, '../..', path), 'utf8').replace(
        /--[^\r\n]*/g,
        '',
    );

describe('Migracje SB (bez połączenia z bazą)', () => {
    it('tworzy idempotentnie pięć tabel, zgodne FK, indeksy i unikalny stan/login', () => {
        const source = sql('sbAccess/migrations/001_create_sb_access.sql');
        expect(source.match(/CREATE TABLE IF NOT EXISTS/g)).toHaveLength(5);
        for (const table of [
            'SbAccessStatuses',
            'SbAccessActions',
            'SbAccessResults',
            'SbAccess',
            'SbAccessEvents',
        ])
            expect(source).toContain(`CREATE TABLE IF NOT EXISTS ${table} (`);
        expect(source).toMatch(/UNIQUE KEY \w+ \(PersonId\)/);
        expect(source).toMatch(/UNIQUE KEY \w+ \(GithubLogin\)/);
        expect(source.match(/PersonId INT\(11\)/g)).toHaveLength(3);
        expect(source.match(/REFERENCES Persons\(Id\)/g)).toHaveLength(3);
        expect(
            source.match(/ON DELETE CASCADE ON UPDATE CASCADE/g),
        ).toHaveLength(2);
        expect(source).toContain('ON DELETE SET NULL ON UPDATE CASCADE');
        expect(source).toContain('(PersonId, CreatedAt)');
        expect(source.match(/INSERT IGNORE INTO/g)).toHaveLength(3);
        expect(
            source.match(
                /ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci/g,
            ),
        ).toHaveLength(5);
    });

    it('flaga personelu jest idempotentna i domyślnie wyłączona', () => {
        const source = sql('staff/migrations/002_add_can_manage_sb_access.sql');
        expect(source).toMatch(
            /ADD COLUMN IF NOT EXISTS CanManageSbAccess TINYINT\(1\) NOT NULL DEFAULT 0\s+AFTER CanLogSiteVisits/,
        );
        expect(source).not.toMatch(/UPDATE|INSERT/i);
    });

    it('seed identyfikuje konta tylko e-mailem, pomija konflikty i nie dubluje historii', () => {
        const source = sql(
            'sbAccess/migrations/002_seed_initial_sb_access.sql',
        );
        for (const literal of [
            'oramwp@gmail.com',
            'oramm',
            'kotalamichal02@gmail.com',
            'MicKota',
        ])
            expect(source).toContain(`'${literal}'`);
        expect(source).toContain('PersonAccounts.SystemEmail');
        expect(source).not.toMatch(/Persons\.SystemEmail|PersonId\s*=\s*\d+/i);
        expect(source.match(/NOT EXISTS/g)).toHaveLength(3);
        expect(source).toMatch(/s\.PersonId = PersonAccounts\.PersonId/);
        expect(source).toMatch(/s\.GithubLogin = seed\.GithubLogin/);
        expect(source).toMatch(
            /e\.PersonId = PersonAccounts\.PersonId AND e\.ActionCode = 'SEED'/,
        );
        expect(source).toContain("'ACTIVE', seed.GithubLogin, 1");
        expect(source).toContain("'SEED', NULL, 'OK'");
        expect(
            source.match(/'oramwp@gmail.com' COLLATE utf8mb4_unicode_ci/g),
        ).toHaveLength(2);
        expect(
            source.match(
                /'kotalamichal02@gmail.com' COLLATE utf8mb4_unicode_ci/g,
            ),
        ).toHaveLength(2);
        expect(source).not.toMatch(/UPDATE|DELETE/i);
    });
});
