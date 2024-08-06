import mysql from 'mysql2/promise';
import ToolsDb from '../tools/ToolsDb';
import Offer from './Offer';
import ContractType from '../contracts/contractTypes/ContractType';
import City from '../Admin/Cities/City';
import ExternalOffer from './ExternalOffer';
import OurOffer from './OurOffer';
import {
    ExternalOfferData,
    OfferBondData,
    OfferData,
    OurOfferData,
} from '../types/types';
import OfferBond from './OfferBond/OfferBond';

export type OffersSearchParams = {
    id?: number;
    alias?: string;
    submissionDeadlineFrom?: string;
    submissionDeadlineTo?: string;
    status?: string;
    _city?: City;
    _type?: ContractType;
    searchText?: string;
    _offerBond?: OfferBondData;
};

export default class OffersController {
    static async getOffersList(orConditions: OffersSearchParams[] = []) {
        const sql = `SELECT Offers.Id,
                Offers.Alias,
                Offers.Description,
                Offers.Comment,
                Offers.CreationDate,
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
                Offers.resourcesGdFolderId,
                Offers.TenderUrl,
                OfferBonds.Id AS BondId,
                OfferBonds.Value AS BondValue,
                OfferBonds.Form AS BondForm,
                OfferBonds.PaymentData AS BondPaymentData,
                OfferBonds.Comment AS BondComment,
                OfferBonds.Status AS BondStatus,
                OfferBonds.ExpiryDate AS BondExpiryDate,
                Cities.Id AS CityId,
                Cities.Name AS CityName,
                Cities.Code AS CityCode,
                ContractTypes.Id AS MainContractTypeId, 
                ContractTypes.Name AS TypeName, 
                ContractTypes.Description AS TypeDescription,
                Persons.Id AS EditorId,
                Persons.Name AS EditorName,
                Persons.Surname AS EditorSurname,
                Persons.Email AS EditorEmail
            FROM Offers
            LEFT JOIN Cities ON Cities.Id=Offers.CityId
            LEFT JOIN ContractTypes ON ContractTypes.Id = Offers.TypeId
            LEFT JOIN OfferBonds ON OfferBonds.OfferId = Offers.Id
            LEFT JOIN Persons ON Persons.Id = Offers.EditorId
            WHERE ${ToolsDb.makeOrGroupsConditions(
                orConditions,
                this.makeAndConditions.bind(this)
            )}
            ORDER BY Offers.SubmissionDeadline ASC;`;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processOffersResult(result);
    }

    static makeAndConditions(searchParams: OffersSearchParams) {
        const conditions = [];

        if (searchParams.id) {
            conditions.push(mysql.format(`Offers.Id = ?`, [searchParams.id]));
        }
        if (searchParams._city?.id) {
            conditions.push(
                mysql.format(`Cities.Id = ?`, [searchParams._city.id])
            );
        }
        if (searchParams.submissionDeadlineFrom) {
            conditions.push(
                mysql.format(`Offers.SubmissionDeadline >= ?`, [
                    searchParams.submissionDeadlineFrom,
                ])
            );
        }
        if (searchParams.submissionDeadlineTo) {
            conditions.push(
                mysql.format(`Offers.SubmissionDeadline <= ?`, [
                    searchParams.submissionDeadlineTo,
                ])
            );
        }
        if (searchParams.status) {
            conditions.push(
                mysql.format(`Offers.Status = ?`, [searchParams.status])
            );
        }
        if (searchParams.alias) {
            conditions.push(
                mysql.format(`Offers.Alias LIKE ?`, [`%${searchParams.alias}%`])
            );
        }
        const searchTextCondition = this.makeSearchTextCondition(
            searchParams.searchText
        );
        if (searchTextCondition !== '1') {
            conditions.push(searchTextCondition);
        }

        if (searchParams._offerBond?.status) {
            conditions.push(
                mysql.format(`OfferBonds.Status = ?`, [
                    searchParams._offerBond.status,
                ])
            );
        }

        return conditions.length > 0 ? conditions.join(' AND ') : '1';
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
            const offerInitData: ExternalOfferData | OurOfferData = {
                id: row.Id,
                alias: ToolsDb.sqlToString(row.Alias),
                description: ToolsDb.sqlToString(row.Description),
                comment: ToolsDb.sqlToString(row.Comment),
                creationDate: row.CreationDate,
                submissionDeadline: row.SubmissionDeadline,
                form: ToolsDb.sqlToString(row.Form),
                isOur: row.IsOur,
                cityId: row.CityId,
                status: row.Status,
                bidProcedure: ToolsDb.sqlToString(row.BidProcedure),
                gdFolderId: row.GdFolderId,
                gdDocumentId: row.GdDocumentId,
                tenderUrl: row.TenderUrl,
                resourcesGdFolderId: row.resourcesGdFolderId,
                _lastUpdated: row.LastUpdated,
                _employer: { name: ToolsDb.sqlToString(row.EmployerName) },
                _type: {
                    id: row.MainContractTypeId,
                    name: row.TypeName,
                    description: row.TypeDescription,
                    isOur: true,
                    status: 'active',
                },
                _city: {
                    id: row.CityId,
                    name: row.CityName,
                    code: row.CityCode,
                },
                _editor: {
                    id: row.EditorId,
                    name: ToolsDb.sqlToString(row.EditorName),
                    surname: ToolsDb.sqlToString(row.EditorSurname),
                    email: ToolsDb.sqlToString(row.EditorEmail),
                },
                _offerBond: this.makeOfferBond(
                    {
                        id: row.BondId,
                        offerId: row.Id,
                        value: row.BondValue,
                        form: ToolsDb.sqlToString(row.BondForm),
                        paymentData: ToolsDb.sqlToString(row.BondPaymentData),
                        comment: ToolsDb.sqlToString(row.BondComment),
                        status: row.BondStatus,
                        expiryDate: row.BondExpiryDate,
                    },
                    row.IsOur
                ),
            };

            const item = row.IsOur
                ? new OurOffer(offerInitData)
                : new ExternalOffer(offerInitData);

            newResult.push(item);
        }
        return newResult;
    }

    private static makeOfferBond(initData: OfferBondData, isOurOffer: boolean) {
        if (isOurOffer) return undefined;
        if (!initData.id) return null;
        return new OfferBond(initData);
    }
}
