import mysql from 'mysql2/promise';
import ToolsDb from '../tools/ToolsDb';
import Offer, { OfferInitParams } from './Offer';
import ContractType from '../contracts/contractTypes/ContractType';
import City from '../Admin/Cities/City';
import Person from '../persons/Person';
import OtherOffer from './OtherOffer';
import OurOffer from './OurOffer';

export type OffersSearchParams = {
    id?: number;
    alias?: string;
    submissionDeadlineFrom?: string;
    submissionDeadlineTo?: string;
    status?: string;
    _city?: City;
    _type?: ContractType;
    searchText?: string;
};

export default class OffersController {
    static async getOffersList(orConditions: OffersSearchParams[] = []) {
        console.log(orConditions);
        const sql = `SELECT Offers.Id,
                Offers.Alias,
                Offers.Description,
                Offers.SubmissionDeadline,
                Offers.TypeId,
                Offers.Form,
                Offers.IsOur,
                Offers.Status,
                Offers.BidProcedure,
                Offers.EditorId,
                Offers.EmployerName,
                Offers.LastUpdated,
                Offers.GdFolderId,
                Offers.GdDocumentId,
                Cities.Id AS CityId,
                Cities.Name AS CityName,
                Cities.Code AS CityCode,
                ContractTypes.Id AS MainContractTypeId, 
                ContractTypes.Name AS TypeName, 
                ContractTypes.IsOur AS TypeIsOur, 
                ContractTypes.Description AS TypeDescription,
                Persons.Id AS EditorId,
                Persons.Name AS EditorName,
                Persons.Surname AS EditorSurname,
                Persons.Email AS EditorEmail
            FROM Offers
            JOIN Cities ON Cities.Id=Offers.CityId
            LEFT JOIN ContractTypes ON ContractTypes.Id = Offers.TypeId
            LEFT JOIN Persons ON Persons.Id = Offers.EditorId
            WHERE ${ToolsDb.makeOrGroupsConditions(
                orConditions,
                this.makeAndConditions.bind(this)
            )}
            ORDER BY Offers.SubmissionDeadline;`;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processOffersResult(result);
    }

    static makeAndConditions(searchParams: OffersSearchParams) {
        const idCondition = searchParams.id
            ? mysql.format(`Offers.Id = ?`, [searchParams.id])
            : '1';
        const cityCondition = searchParams._city?.id
            ? mysql.format(`Cities.Id = ?`, [searchParams._city.id])
            : '1';
        const submissionDeadlineFromCondition =
            searchParams.submissionDeadlineFrom
                ? mysql.format(`Offers.SubmissionDeadline >= ?`, [
                      searchParams.submissionDeadlineFrom,
                  ])
                : '1';
        const submissionDeadlineToCondition = searchParams.submissionDeadlineTo
            ? mysql.format(`Offers.SubmissionDeadline <= ?`, [
                  searchParams.submissionDeadlineTo,
              ])
            : '1';
        const statusCondition = searchParams.status
            ? mysql.format(`Offers.Status = ?`, [searchParams.status])
            : '1';
        const aliasCondition = searchParams.alias
            ? mysql.format(`Offers.Alias LIKE ?`, [`%${searchParams.alias}%`])
            : '1';

        const searchTextCondition = this.makeSearchTextCondition(
            searchParams.searchText
        );

        return `${idCondition}
            AND ${cityCondition}
            AND ${submissionDeadlineFromCondition}
            AND ${submissionDeadlineToCondition}
            AND ${statusCondition}
            AND ${aliasCondition}
            AND ${searchTextCondition}`;
    }

    static makeSearchTextCondition(searchText: string | undefined) {
        if (!searchText) return '1';
        if (searchText) searchText = searchText.toString();
        const words = searchText.split(' ');
        const conditions = words.map((word) =>
            mysql.format(
                `(Offers.Alias LIKE ?
                OR Offers.Description LIKE ?
                OR Cities.Name LIKE ?
                OR Offers.EmployerName LIKE ?)`,
                [`%${word}%`, `%${word}%`, `%${word}%`, `%${word}%`]
            )
        );

        const searchTextCondition = conditions.join(' AND ');
        return searchTextCondition;
    }
    static processOffersResult(result: any[]): Offer[] {
        let newResult: Offer[] = [];

        for (const row of result) {
            const offerInitData: OfferInitParams = {
                id: row.Id,
                alias: ToolsDb.sqlToString(row.Alias),
                description: ToolsDb.sqlToString(row.Description),
                submissionDeadline: row.SubmissionDeadline,
                form: ToolsDb.sqlToString(row.Form),
                isOur: row.IsOur,
                status: row.Status,
                bidProcedure: ToolsDb.sqlToString(row.BidProcedure),
                gdFolderId: row.GdFolderId,
                _lastUpdated: row.LastUpdated,
                _employer: { name: ToolsDb.sqlToString(row.EmployerName) },
                _type: new ContractType({
                    id: row.MainContractTypeId,
                    name: row.TypeName,
                    description: row.TypeDescription,
                }),
                _city: new City({
                    id: row.CityId,
                    name: row.CityName,
                    code: row.CityCode,
                }),
                _editor: new Person({
                    id: row.EditorId,
                    name: ToolsDb.sqlToString(row.EditorName),
                    surname: ToolsDb.sqlToString(row.EditorSurname),
                    email: ToolsDb.sqlToString(row.EditorEmail),
                }),
            };

            const item = row.GdGileId
                ? new OurOffer({ ...offerInitData, gdGileId: row.GdGileId })
                : new OtherOffer(offerInitData);

            newResult.push(item);
        }
        return newResult;
    }
}
