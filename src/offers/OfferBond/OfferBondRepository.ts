import BaseRepository from '../../repositories/BaseRepository';
import OfferBond from './OfferBond';
import ToolsDb from '../../tools/ToolsDb';
import mysql from 'mysql2/promise';

export type OfferBondSearchParams = {
    id?: number;
    offerId?: number;
    status?: string;
    searchText?: string;
};

/**
 * Repository dla OfferBond - warstwa dostępu do danych
 *
 * Zgodnie z Clean Architecture:
 * - Dziedziczy po BaseRepository<OfferBond>
 * - Odpowiedzialny TYLKO za operacje CRUD i SQL
 * - NIE zawiera logiki biznesowej
 */
export default class OfferBondRepository extends BaseRepository<OfferBond> {
    constructor() {
        super('OfferBonds');
    }

    /**
     * Wyszukuje wadiów w bazie danych
     *
     * @param orConditions - Warunki wyszukiwania (OR groups)
     * @returns Promise<OfferBond[]> - Lista znalezionych wadiów
     */
    async find(
        orConditions: OfferBondSearchParams[] = []
    ): Promise<OfferBond[]> {
        const sql = `SELECT OfferBonds.Id,
            OfferBonds.Value,
            OfferBonds.Form,
            OfferBonds.PaymentData,
            OfferBonds.Comment,
            OfferBonds.Status,
            OfferBonds.ExpiryDate,
            Offers.Id as OfferId,
            Offers.Alias as OfferAlias
        FROM OfferBonds
        JOIN Offers ON OfferBonds.OfferId = Offers.Id
        WHERE ${ToolsDb.makeOrGroupsConditions(
            orConditions,
            this.makeAndConditions.bind(this)
        )}
        ORDER BY OfferBonds.Id ASC`;

        const result = await ToolsDb.getQueryCallbackAsync(sql);
        return (result as any[]).map((row) => this.mapRowToModel(row));
    }

    /**
     * Mapuje wiersz z bazy danych na instancję OfferBond
     *
     * @param row - Wiersz z bazy danych
     * @returns OfferBond - Instancja modelu
     */
    protected mapRowToModel(row: any): OfferBond {
        return new OfferBond({
            id: row.Id,
            value: row.Value,
            form: row.Form,
            paymentData: row.PaymentData,
            comment: ToolsDb.sqlToString(row.Comment),
            status: row.Status,
            expiryDate: row.ExpiryDate,
            offerId: row.OfferId,
        });
    }

    /**
     * Buduje warunki AND dla zapytania SQL
     *
     * @param searchParams - Parametry wyszukiwania
     * @returns string - Warunki SQL
     */
    private makeAndConditions(searchParams: OfferBondSearchParams): string {
        const conditions: string[] = [];

        const searchTextCondition = this.makeSearchTextCondition(
            searchParams.searchText
        );
        if (searchTextCondition !== '1') {
            conditions.push(searchTextCondition);
        }

        if (searchParams.offerId) {
            conditions.push(
                mysql.format(`OfferBonds.OfferId = ?`, [searchParams.offerId])
            );
        }

        if (searchParams.status) {
            conditions.push(
                mysql.format(`OfferBonds.Status = ?`, [searchParams.status])
            );
        }

        return conditions.length ? conditions.join(' AND ') : '1';
    }

    /**
     * Buduje warunek wyszukiwania tekstowego
     *
     * @param searchText - Tekst do wyszukania
     * @returns string - Warunek SQL
     */
    private makeSearchTextCondition(searchText: string | undefined): string {
        if (!searchText) return '1';
        searchText = searchText.toString();
        const words = searchText.split(' ');
        const conditions = words.map((word) =>
            mysql.format(`OfferBonds.Comment LIKE ?`, [`%${word}%`])
        );

        return conditions.join(' AND ');
    }

    /**
     * Usuwa wadium z bazy danych
     *
     * @param offerBond - Wadium do usunięcia
     */
    async delete(offerBond: OfferBond): Promise<void> {
        if (!offerBond.id) throw new Error('No offerBond id');
        await this.deleteFromDb(offerBond);
    }
}
