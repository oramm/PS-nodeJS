import mysql from 'mysql2/promise';
import ToolsDb from '../../tools/ToolsDb';
import { OfferBondData, OfferData } from '../../types/types';
import OfferBond from './OfferBond';

type OfferBondSearchParams = {
    id?: number;
    offerId?: number;
    _offer?: OfferData; // Assuming OfferData represents the data structure of an offer
    status?: string;
    searchText?: string;
};

export default class OfferBondsController {
    static async getOfferBondsList(orConditions: OfferBondSearchParams[] = []) {
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
        JOIN Cities ON Offers.CityId = Cities.Id
        JOIN ContractTypes AS OfferType ON Offers.TypeId = OfferTypes.Id
        JOIN Persons AS Editor ON Offers.EditorId = Editor.Id
        LEFT JOIN FinancialAidProgrammes ON Offers.FinancialAidProgrammeId = FinancialAidProgrammes.Id
        WHERE ${ToolsDb.makeOrGroupsConditions(
            orConditions,
            this.makeAndConditions.bind(this)
        )}
        ORDER BY OfferBonds.Id ASC`;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return await this.processOfferBondsResult(result);
    }

    static makeAndConditions(searchParams: OfferBondSearchParams) {
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

    static makeSearchTextCondition(searchText: string | undefined) {
        if (!searchText) return '1';
        searchText = searchText.toString();
        const words = searchText.split(' ');
        const conditions = words.map((word) =>
            mysql.format(`(OfferBonds.Comment LIKE ? OR Offers.Name LIKE ?)`, [
                `%${word}%`,
                `%${word}%`,
            ])
        );

        const searchTextCondition = conditions.join(' AND ');
        return searchTextCondition;
    }

    static processOfferBondsResult(result: any[]): OfferBond[] {
        let newResult: OfferBond[] = [];

        for (const row of result) {
            const item = new OfferBond({
                id: row.Id,
                value: row.Value,
                form: row.Form,
                paymentData: row.PaymentData,
                comment: ToolsDb.sqlToString(row.Comment),
                status: row.Status,
                expiryDate: row.ExpiryDate,
                offerId: row.OfferId,
            });

            newResult.push(item);
        }
        return newResult;
    }
}
