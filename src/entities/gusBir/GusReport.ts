import mysql from 'mysql2/promise';
import ToolsDb from '../../tools/ToolsDb';
import { GusStatus } from './GusCompare';

/**
 * GUS-3 — cztery listy do sprzątania słownika podmiotów.
 *
 * Pack GUS, checkpoint GUS-3, zadanie 4:
 *   20_projects/Aplikacje/PS.APP.01/plans/2026-09-09-gus-synchronizacja-podmiotow-plan.md
 *
 * To są dane dla zakładki panelu administracyjnego z GUS-4. Sam odczyt, ani jednego zapisu:
 * co zrobić z duplikatem albo z podmiotem po zakończonej działalności, rozstrzyga człowiek
 * przy każdej pozycji osobno (D-GUS-5, D-GUS-4).
 *
 * DUPLIKATY LICZYMY PO NIP-IE SPROWADZONYM DO CYFR. Kolumna TaxNumber ma klucz unikalny,
 * ale ta unikalność jest pozorna: ten sam numer wpisany raz z myślnikami, raz bez, to dla
 * bazy dwa różne teksty. Dlatego grupujemy po REGEXP_REPLACE, a nie po samej kolumnie.
 *
 * PODMIOTY BEZ NIP-U to dosłownie brak numeru (NULL albo same białe znaki). Numeru, który
 * jest, ale nie jest polskim NIP-em, ta lista nie obejmuje — takiego podmiotu nie brakuje
 * do uzupełnienia, on po prostu nie należy do polskiego rejestru.
 */

export type GusReportEntity = {
    id: number;
    name: string | null;
    taxNumber: string | null;
    gusStatus: GusStatus | null;
    gusCheckedAt: Date | null;
};

export type GusDuplicateGroup = {
    /** NIP sprowadzony do samych cyfr — po nim zbiegły się rekordy w grupie. */
    nip: string;
    entities: GusReportEntity[];
};

export type GusReport = {
    duplicateNips: GusDuplicateGroup[];
    withoutNip: GusReportEntity[];
    closed: GusReportEntity[];
    diff: GusReportEntity[];
};

const ENTITY_COLUMNS = `Entities.Id,
                        Entities.Name,
                        Entities.TaxNumber,
                        Entities.GusStatus,
                        Entities.GusCheckedAt`;

/** NIP sprowadzony do samych cyfr — ten sam zabieg co normalizeNip, przepisany na SQL. */
const NIP_DIGITS = `REGEXP_REPLACE(Entities.TaxNumber, '[^0-9]', '')`;

function toReportEntity(row: any): GusReportEntity {
    return {
        id: row.Id,
        name: row.Name ?? null,
        taxNumber: row.TaxNumber ?? null,
        gusStatus: (row.GusStatus as GusStatus) ?? null,
        gusCheckedAt: row.GusCheckedAt ?? null,
    };
}

async function selectEntities(where: string): Promise<GusReportEntity[]> {
    const rows = (await ToolsDb.getQueryCallbackAsync(
        `SELECT ${ENTITY_COLUMNS}
           FROM Entities
          WHERE ${where}
          ORDER BY Entities.Name ASC`
    )) as any[];
    return rows.map(toReportEntity);
}

async function selectByStatus(status: GusStatus): Promise<GusReportEntity[]> {
    return selectEntities(`Entities.GusStatus = ${mysql.escape(status)}`);
}

/**
 * Rekordy dzielące ten sam NIP po sprowadzeniu do cyfr, w grupach.
 *
 * Dwa zapytania zamiast korelowanego podzapytania: najpierw same numery, które się
 * powtarzają (grup jest kilka), potem rekordy dla nich. Przy 479 podmiotach różnica
 * w koszcie jest żadna, a zapytania dają się przeczytać.
 */
async function selectDuplicateNips(): Promise<GusDuplicateGroup[]> {
    const groups = (await ToolsDb.getQueryCallbackAsync(
        `SELECT ${NIP_DIGITS} AS Nip, COUNT(*) AS Ile
           FROM Entities
          WHERE Entities.TaxNumber IS NOT NULL
            AND ${NIP_DIGITS} <> ''
          GROUP BY ${NIP_DIGITS}
         HAVING COUNT(*) > 1
          ORDER BY Nip ASC`
    )) as { Nip: string; Ile: number }[];

    if (!groups.length) return [];

    const nips = groups.map((group) => group.Nip);
    const rows = (await ToolsDb.getQueryCallbackAsync(
        `SELECT ${ENTITY_COLUMNS}, ${NIP_DIGITS} AS Nip
           FROM Entities
          WHERE ${NIP_DIGITS} IN (${nips
              .map((nip) => mysql.escape(nip))
              .join(', ')})
          ORDER BY Nip ASC, Entities.Name ASC`
    )) as any[];

    return groups.map((group) => ({
        nip: group.Nip,
        entities: rows
            .filter((row) => row.Nip === group.Nip)
            .map(toReportEntity),
    }));
}

export async function buildGusReport(): Promise<GusReport> {
    const [duplicateNips, withoutNip, closed, diff] = await Promise.all([
        selectDuplicateNips(),
        selectEntities(
            `(Entities.TaxNumber IS NULL OR TRIM(Entities.TaxNumber) = '')`
        ),
        selectByStatus('CLOSED'),
        selectByStatus('DIFF'),
    ]);
    return { duplicateNips, withoutNip, closed, diff };
}
