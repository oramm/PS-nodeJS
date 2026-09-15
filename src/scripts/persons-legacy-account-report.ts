/**
 * RAPORT ROZJAZDÓW: konto osoby (PersonAccounts) vs zaszłe kolumny konta w Persons.
 * Pack ROD, checkpoint ROD-5 (2026-09-08).
 *
 * READ-ONLY. Wypisuje WYŁĄCZNIE liczby i numery osób (Persons.Id) - nigdy nazwisk ani adresów,
 * więc wynik wolno wkleić do raportu. Uruchamiaj:
 *  - przed `migrate:apply` migracji 009 (lokalnie i na produkcji): sekcje A, B, E mówią, komu
 *    migracja założy albo uzupełni konto; sekcje *-taken, F, G, H wymagają ręcznej decyzji;
 *  - przed krokiem 2 (DROP zaszłych kolumn): wszystko poza F i G ma być puste.
 *
 * Użycie:
 *   yarn persons:legacy-report                                                          # lokalnie
 *   cross-env NODE_ENV=production ts-node src/scripts/persons-legacy-account-report.ts   # produkcja
 */

import { loadEnv } from '../setup/loadEnv';
loadEnv();

import ToolsDb from '../tools/ToolsDb';
import { AGENT_SYSTEM_EMAIL } from '../setup/Sessions/agentTokenAuth';

/** Wartość domyślna zaszłej kolumny Persons.SystemRoleId (EXTERNAL_USER) - nikt jej nie wybierał. */
const LEGACY_DEFAULT_ROLE_ID = 5;

const LEGACY_EMAIL = "NULLIF(TRIM(p.SystemEmail), '')";
const LEGACY_GOOGLE_ID = "NULLIF(TRIM(p.GoogleId), '')";
const ACCOUNT_EMAIL = "NULLIF(TRIM(a.SystemEmail), '')";
const LEGACY_HAS_REAL_VALUE = `(${LEGACY_EMAIL} IS NOT NULL OR ${LEGACY_GOOGLE_ID} IS NOT NULL OR p.SystemRoleId <> ${LEGACY_DEFAULT_ROLE_ID})`;
const LEGACY_EMAIL_TAKEN =
    'EXISTS (SELECT 1 FROM PersonAccounts t WHERE t.SystemEmail = TRIM(p.SystemEmail))';

type Section = { key: string; title: string; sql: string };

const SECTIONS: Section[] = [
    {
        key: 'A',
        title: 'Osoby bez konta z realną wartością w zaszłych kolumnach -> migracja 009 zakłada konto',
        sql: `SELECT p.Id, p.SystemRoleId AS legacyRole, (${LEGACY_EMAIL} IS NOT NULL) AS hasLegacyEmail
              FROM Persons p LEFT JOIN PersonAccounts a ON a.PersonId = p.Id
              WHERE a.Id IS NULL AND ${LEGACY_HAS_REAL_VALUE} ORDER BY p.Id`,
    },
    {
        key: 'A-taken',
        title: 'Jak A, ale zaszły e-mail zajęty przez inne konto -> konto powstanie BEZ e-maila (decyzja ręczna)',
        sql: `SELECT p.Id FROM Persons p LEFT JOIN PersonAccounts a ON a.PersonId = p.Id
              WHERE a.Id IS NULL AND ${LEGACY_EMAIL} IS NOT NULL AND ${LEGACY_EMAIL_TAKEN} ORDER BY p.Id`,
    },
    {
        key: 'A0',
        title: 'Osoby bez konta z samą domyślną zaszłą rolą -> zostają bez konta (nie są użytkownikami)',
        sql: `SELECT p.Id FROM Persons p LEFT JOIN PersonAccounts a ON a.PersonId = p.Id
              WHERE a.Id IS NULL AND NOT ${LEGACY_HAS_REAL_VALUE} ORDER BY p.Id`,
    },
    {
        key: 'B',
        title: 'Konto z pustym e-mailem logowania, zaszły e-mail wolny -> migracja 009 przepisuje (dziś logują po zaszłej kolumnie)',
        sql: `SELECT p.Id, a.IsActive AS accountActive FROM Persons p JOIN PersonAccounts a ON a.PersonId = p.Id
              WHERE ${ACCOUNT_EMAIL} IS NULL AND ${LEGACY_EMAIL} IS NOT NULL AND NOT ${LEGACY_EMAIL_TAKEN} ORDER BY p.Id`,
    },
    {
        key: 'B-taken',
        title: 'Konto z pustym e-mailem, zaszły e-mail zajęty przez inne konto -> decyzja ręczna',
        sql: `SELECT p.Id FROM Persons p JOIN PersonAccounts a ON a.PersonId = p.Id
              WHERE ${ACCOUNT_EMAIL} IS NULL AND ${LEGACY_EMAIL} IS NOT NULL AND ${LEGACY_EMAIL_TAKEN} ORDER BY p.Id`,
    },
    {
        key: 'E',
        title: 'Konto bez roli -> migracja 009 przepisuje rolę z zaszłej kolumny (do dziś obowiązywała przy logowaniu)',
        sql: `SELECT p.Id, p.SystemRoleId AS legacyRole FROM Persons p JOIN PersonAccounts a ON a.PersonId = p.Id
              WHERE a.SystemRoleId IS NULL ORDER BY p.Id`,
    },
    {
        key: 'F',
        title: 'Rozjazd roli: konto vs zaszła kolumna -> obowiązuje KONTO (D-ROD-8); zaszła 5 = wartość domyślna, nie wybór',
        sql: `SELECT p.Id, a.SystemRoleId AS accountRole, p.SystemRoleId AS legacyRole, a.IsActive AS accountActive
              FROM Persons p JOIN PersonAccounts a ON a.PersonId = p.Id
              WHERE a.SystemRoleId IS NOT NULL AND a.SystemRoleId <> p.SystemRoleId ORDER BY p.Id`,
    },
    {
        key: 'G',
        title: 'Rozjazd e-maila logowania: konto vs zaszła kolumna -> obowiązuje KONTO (zaszły adres już dziś nie loguje)',
        sql: `SELECT p.Id FROM Persons p JOIN PersonAccounts a ON a.PersonId = p.Id
              WHERE ${ACCOUNT_EMAIL} IS NOT NULL AND ${LEGACY_EMAIL} IS NOT NULL
                AND LOWER(TRIM(a.SystemEmail)) <> LOWER(TRIM(p.SystemEmail)) ORDER BY p.Id`,
    },
    {
        key: 'H',
        title: 'Konto WYŁĄCZONE z zaszłym e-mailem -> dziś loguje po zaszłej kolumnie, po ROD-5 nie zaloguje się (zamierzone)',
        sql: `SELECT p.Id FROM Persons p JOIN PersonAccounts a ON a.PersonId = p.Id
              WHERE a.IsActive = 0 AND ${LEGACY_EMAIL} IS NOT NULL ORDER BY p.Id`,
    },
    {
        key: 'I',
        title: 'Konto Google tylko w zaszłej kolumnie -> zapisze się w koncie przy pierwszym logowaniu, nic do zrobienia',
        sql: `SELECT p.Id FROM Persons p JOIN PersonAccounts a ON a.PersonId = p.Id
              WHERE NULLIF(TRIM(a.GoogleId), '') IS NULL AND ${LEGACY_GOOGLE_ID} IS NOT NULL ORDER BY p.Id`,
    },
];

async function query(
    sql: string,
    params: any[] = [],
): Promise<Record<string, any>[]> {
    const rows = await ToolsDb.getQueryCallbackAsync(sql, undefined, params);
    return Array.isArray(rows) ? (rows as Record<string, any>[]) : [];
}

/** Numer osoby plus cechy liczbowe (rola, flaga) - nigdy nazwisko ani adres. */
function formatRow(row: Record<string, any>): string {
    const { Id, ...rest } = row;
    const extras = Object.entries(rest)
        .map(([key, value]) => `${key}=${value}`)
        .join(', ');
    return extras ? `${Id} (${extras})` : String(Id);
}

async function main() {
    console.log(
        `[legacy-report] env=${process.env.NODE_ENV || 'production'} db=${process.env.DB_HOST}/${process.env.DB_NAME}`,
    );

    const [counts] = await query(`SELECT
        (SELECT COUNT(*) FROM Persons) AS persons,
        (SELECT COUNT(*) FROM PersonAccounts) AS accounts,
        (SELECT COUNT(*) FROM PersonAccounts WHERE NULLIF(TRIM(SystemEmail), '') IS NOT NULL) AS accountsWithEmail,
        (SELECT COUNT(*) FROM Persons WHERE NULLIF(TRIM(SystemEmail), '') IS NOT NULL) AS legacyEmails,
        (SELECT COUNT(*) FROM PersonAccounts WHERE IsActive = 0) AS inactiveAccounts`);
    console.log(
        `[legacy-report] osoby=${counts.persons} konta=${counts.accounts} konta z e-mailem=${counts.accountsWithEmail} zaszłe e-maile=${counts.legacyEmails} konta wyłączone=${counts.inactiveAccounts}`,
    );

    for (const section of SECTIONS) {
        const rows = await query(section.sql);
        console.log(`\n[${section.key}] ${section.title}`);
        console.log(
            `  liczba: ${rows.length}${rows.length ? '  osoby: ' + rows.map(formatRow).join('; ') : ''}`,
        );
    }

    const agentAccount = await query(
        'SELECT PersonId, SystemRoleId, IsActive FROM PersonAccounts WHERE SystemEmail = ?',
        [AGENT_SYSTEM_EMAIL],
    );
    const agentLegacy = await query(
        'SELECT Id FROM Persons WHERE SystemEmail = ?',
        [AGENT_SYSTEM_EMAIL],
    );
    console.log(
        `\n[agent] konto agenta rejestracji pism (${AGENT_SYSTEM_EMAIL}) w PersonAccounts: ${
            agentAccount.length
                ? `TAK (osoba ${agentAccount[0].PersonId}, rola ${agentAccount[0].SystemRoleId}, aktywne=${agentAccount[0].IsActive})`
                : 'NIE'
        }; w zaszłej kolumnie Persons: ${agentLegacy.length ? `TAK (osoba ${agentLegacy[0].Id})` : 'NIE'}`,
    );
    if (!agentAccount.length && agentLegacy.length) {
        console.warn(
            '[agent] UWAGA: agent ma e-mail tylko w zaszłej kolumnie - po ROD-5 wejście tokenem przestanie działać, dopóki migracja 009 nie przepisze adresu do konta.',
        );
    }
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('[legacy-report] Błąd:', err);
        process.exit(1);
    });
