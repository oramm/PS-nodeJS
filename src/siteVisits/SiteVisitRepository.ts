import mysql from 'mysql2/promise';
import BaseRepository from '../repositories/BaseRepository';
import ToolsDb from '../tools/ToolsDb';
import ToolsGd from '../tools/ToolsGd';
import SiteVisit, { SiteVisitData, SiteVisitPhotoData } from './SiteVisit';

export interface SiteVisitSearchParams {
    id?: number;
    personId?: number;
    contractId?: number;
    dateFrom?: string; // 'YYYY-MM-DD' (włącznie)
    dateTo?: string; // 'YYYY-MM-DD' (włącznie)
    text?: string; // szuka w opisie oraz nazwie/OurId kontraktu
}

/** Wiersz podsumowania w panelu przeglądu (grupowanie po osobie lub kontrakcie). */
export interface VisitSummaryRow {
    groupKey: number;
    label: string;
    count: number;
}

/** Kontrakt (budowa) dostępny dla użytkownika w wyborze wizyty. */
export interface AssignableContract {
    id: number;
    ourId: string | null;
    number: string | null;
    name: string;
    status: string;
    gdFolderId: string | null;
    cityName: string | null;
    ourIdRelated: string | null; // dla zewnętrznych: OurId powiązanego kontraktu wewnętrznego
    typeName: string | null; // nazwa typu kontraktu (dla etykiety zewnętrznego)
}

// Kontrakty "nieaktywne" - poza zakresem rejestrowania wizyt.
const INACTIVE_STATUSES = ['Zakończony', 'Archiwalny'];

export default class SiteVisitRepository extends BaseRepository<SiteVisit> {
    constructor() {
        super('SiteVisits');
    }

    protected mapRowToModel(row: any): SiteVisit {
        return new SiteVisit({
            id: row.Id,
            contractId: row.ContractId,
            personId: row.PersonId,
            description: row.Description,
            gdFolderId: row.GdFolderId,
            visitedAt: row.VisitedAt,
            _contractLabel: [row.OurId, row.ContractName].filter(Boolean).join(' '),
            _authorName: [row.PersonName, row.PersonSurname]
                .filter(Boolean)
                .join(' '),
            _gdFolderUrl: row.GdFolderId
                ? ToolsGd.createGdFolderUrl(row.GdFolderId)
                : undefined,
        });
    }

    /**
     * Kontrakty, do których zalogowana osoba jest przypisana rolą (Roles) i które
     * są aktywne (Status inny niż Zakończony/Archiwalny). Rola może być na
     * poziomie kontraktu (ContractId) albo projektu (ProjectOurId) - w drugim
     * przypadku obejmuje wszystkie kontrakty projektu.
     */
    async getAssignableContracts(personId: number): Promise<AssignableContract[]> {
        const placeholders = INACTIVE_STATUSES.map(() => '?').join(', ');
        // Miasto jest przypisane tylko do kontraktów WEWNĘTRZNYCH (OurContractsData).
        // Dla zewnętrznych bierzemy miasto powiązanego kontraktu wewnętrznego
        // (Contracts.OurIdRelated -> OurContractsData.OurId -> CityId).
        const sql = `
            SELECT DISTINCT
                c.Id AS id,
                c.Name AS name,
                c.Number AS number,
                c.Status AS status,
                c.GdFolderId AS gdFolderId,
                oc.OurId AS ourId,
                c.OurIdRelated AS ourIdRelated,
                ct.Name AS typeName,
                COALESCE(ci.Name, relCi.Name) AS cityName
            FROM Contracts c
            LEFT JOIN OurContractsData oc ON oc.Id = c.Id
            LEFT JOIN ContractTypes ct ON ct.Id = c.TypeId
            LEFT JOIN Cities ci ON ci.Id = oc.CityId
            LEFT JOIN OurContractsData relOc ON relOc.OurId = c.OurIdRelated
            LEFT JOIN Cities relCi ON relCi.Id = relOc.CityId
            JOIN Roles r ON (
                r.ContractId = c.Id
                OR (r.ProjectOurId IS NOT NULL AND r.ProjectOurId = c.ProjectOurId)
            )
            WHERE r.PersonId = ?
              AND c.Status NOT IN (${placeholders})
            ORDER BY oc.OurId, c.OurIdRelated, c.Name`;
        const rows = (await ToolsDb.getQueryCallbackAsync(sql, undefined, [
            personId,
            ...INACTIVE_STATUSES,
        ])) as any[];
        return rows.map((r) => ({
            id: r.id,
            ourId: r.ourId ?? null,
            number: r.number ?? null,
            name: r.name,
            status: r.status,
            gdFolderId: r.gdFolderId ?? null,
            cityName: r.cityName ?? null,
            ourIdRelated: r.ourIdRelated ?? null,
            typeName: r.typeName ?? null,
        }));
    }

    /** Pojedynczy kontrakt z listy dostępnych - do autoryzacji i pobrania GdFolderId. */
    async getAssignableContract(
        personId: number,
        contractId: number
    ): Promise<AssignableContract | undefined> {
        const contracts = await this.getAssignableContracts(personId);
        return contracts.find((c) => c.id === contractId);
    }

    /** Wspólny fragment WHERE dla listy i podsumowań (aliasy: sv, c, oc). */
    private buildWhere(p: SiteVisitSearchParams): {
        clause: string;
        values: any[];
    } {
        const conditions: string[] = [];
        const values: any[] = [];
        if (p.id !== undefined) {
            conditions.push('sv.Id = ?');
            values.push(p.id);
        }
        if (p.personId !== undefined) {
            conditions.push('sv.PersonId = ?');
            values.push(p.personId);
        }
        if (p.contractId !== undefined) {
            conditions.push('sv.ContractId = ?');
            values.push(p.contractId);
        }
        if (p.dateFrom) {
            conditions.push('sv.VisitedAt >= ?');
            values.push(`${p.dateFrom} 00:00:00`);
        }
        if (p.dateTo) {
            conditions.push('sv.VisitedAt <= ?');
            values.push(`${p.dateTo} 23:59:59`);
        }
        if (p.text) {
            conditions.push(
                '(sv.Description LIKE ? OR c.Name LIKE ? OR oc.OurId LIKE ?)'
            );
            const like = `%${p.text}%`;
            values.push(like, like, like);
        }
        return {
            clause: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
            values,
        };
    }

    /** Wizyty (nagłówki) z etykietą kontraktu i autorem - najnowsze pierwsze. */
    async find(
        searchParams: SiteVisitSearchParams = {}
    ): Promise<SiteVisit[]> {
        const { clause: where, values } = this.buildWhere(searchParams);
        const sql = `
            SELECT
                sv.Id, sv.ContractId, sv.PersonId, sv.Description,
                sv.GdFolderId, sv.VisitedAt,
                c.Name AS ContractName,
                oc.OurId AS OurId,
                p.Name AS PersonName, p.Surname AS PersonSurname
            FROM SiteVisits sv
            LEFT JOIN Contracts c ON c.Id = sv.ContractId
            LEFT JOIN OurContractsData oc ON oc.Id = c.Id
            LEFT JOIN Persons p ON p.Id = sv.PersonId
            ${where}
            ORDER BY sv.VisitedAt DESC`;
        const rows = (await ToolsDb.getQueryCallbackAsync(
            sql,
            undefined,
            values
        )) as any[];
        const visits = rows.map((row) => this.mapRowToModel(row));
        await this.attachPhotos(visits);
        return visits;
    }

    private async attachPhotos(visits: SiteVisit[]): Promise<void> {
        const ids = visits.map((v) => v.id).filter(Boolean) as number[];
        if (ids.length === 0) return;
        const placeholders = ids.map(() => '?').join(', ');
        const sql = `
            SELECT Id, SiteVisitId, GdFileId, FileName, TakenAt,
                   Latitude, Longitude, GpsAccuracy, SortOrder
            FROM SiteVisitPhotos
            WHERE SiteVisitId IN (${placeholders})
            ORDER BY SiteVisitId, SortOrder, Id`;
        const rows = (await ToolsDb.getQueryCallbackAsync(
            sql,
            undefined,
            ids
        )) as any[];
        const byVisit = new Map<number, SiteVisitPhotoData[]>();
        for (const r of rows) {
            const photo: SiteVisitPhotoData = {
                id: r.Id,
                siteVisitId: r.SiteVisitId,
                gdFileId: r.GdFileId,
                fileName: r.FileName,
                takenAt: r.TakenAt,
                latitude: r.Latitude !== null ? Number(r.Latitude) : null,
                longitude: r.Longitude !== null ? Number(r.Longitude) : null,
                gpsAccuracy: r.GpsAccuracy !== null ? Number(r.GpsAccuracy) : null,
                sortOrder: r.SortOrder,
            };
            const list = byVisit.get(r.SiteVisitId) ?? [];
            list.push(photo);
            byVisit.set(r.SiteVisitId, list);
        }
        for (const visit of visits) {
            visit._photos = visit.id ? byVisit.get(visit.id) ?? [] : [];
        }
    }

    /** Zapis nagłówka wizyty w ramach transakcji. */
    async addVisitInDb(
        visit: SiteVisit,
        conn: mysql.PoolConnection
    ): Promise<SiteVisit> {
        await this.addInDb(visit, conn, true);
        return visit;
    }

    /** Zapis pojedynczego zdjęcia w ramach transakcji. */
    async addPhotoInDb(
        photo: SiteVisitPhotoData,
        conn: mysql.PoolConnection
    ): Promise<SiteVisitPhotoData> {
        await ToolsDb.addInDb('SiteVisitPhotos', photo, conn, true);
        return photo;
    }

    /**
     * Podsumowanie wizyt zgrupowane po osobie lub kontrakcie - tylko wpisy z
     * co najmniej jedną wizytą (GROUP BY sam odfiltrowuje puste). Do panelu przeglądu.
     */
    async getVisitsSummary(
        groupBy: 'person' | 'contract',
        params: SiteVisitSearchParams = {}
    ): Promise<VisitSummaryRow[]> {
        const { clause, values } = this.buildWhere(params);
        const joins = `
            FROM SiteVisits sv
            LEFT JOIN Contracts c ON c.Id = sv.ContractId
            LEFT JOIN OurContractsData oc ON oc.Id = c.Id
            LEFT JOIN Persons p ON p.Id = sv.PersonId`;
        const sql =
            groupBy === 'person'
                ? `SELECT sv.PersonId AS groupKey, COUNT(*) AS count,
                          p.Name AS name, p.Surname AS surname
                   ${joins} ${clause}
                   GROUP BY sv.PersonId
                   ORDER BY count DESC, surname`
                : `SELECT sv.ContractId AS groupKey, COUNT(*) AS count,
                          c.Name AS name, oc.OurId AS ourId
                   ${joins} ${clause}
                   GROUP BY sv.ContractId
                   ORDER BY count DESC, ourId`;
        const rows = (await ToolsDb.getQueryCallbackAsync(
            sql,
            undefined,
            values
        )) as any[];
        return rows.map((r) => ({
            groupKey: r.groupKey,
            count: Number(r.count),
            label:
                groupBy === 'person'
                    ? [r.surname, r.name].filter(Boolean).join(' ') ||
                      `Osoba ${r.groupKey}`
                    : [r.ourId, r.name].filter(Boolean).join(' · ') ||
                      `Kontrakt ${r.groupKey}`,
        }));
    }

    /** Właściciel wizyty do której należy dane zdjęcie (autoryzacja proxy podglądu). */
    async findVisitByPhotoFileId(
        gdFileId: string
    ): Promise<{ visitId: number; personId: number } | undefined> {
        const sql = `
            SELECT sv.Id AS visitId, sv.PersonId AS personId
            FROM SiteVisitPhotos ph
            JOIN SiteVisits sv ON sv.Id = ph.SiteVisitId
            WHERE ph.GdFileId = ?
            LIMIT 1`;
        const rows = (await ToolsDb.getQueryCallbackAsync(sql, undefined, [
            gdFileId,
        ])) as any[];
        if (rows.length === 0) return undefined;
        return { visitId: rows[0].visitId, personId: rows[0].personId };
    }
}
