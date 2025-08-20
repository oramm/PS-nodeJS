import mysql from 'mysql2/promise';
import ToolsDb from '../tools/ToolsDb';
import Offer from './Offer';
import ContractType from '../contracts/contractTypes/ContractType';
import City from '../Admin/Cities/City';
import ExternalOffer from './ExternalOffer';
import OurOffer from './OurOffer';
import { ExternalOfferData, OfferBondData, OurOfferData } from '../types/types';
import OfferBond from './OfferBond/OfferBond';
import OfferEvent from './offerEvent/OfferEvent';
import CitiesController from '../Admin/Cities/CitiesController';

export type OffersSearchParams = {
    id?: number;
    alias?: string;
    submissionDeadlineFrom?: string;
    submissionDeadlineTo?: string;
    statuses?: string[];
    _city?: City;
    _type?: ContractType;
    searchText?: string;
    offerBondStatuses: string[];
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
                Offers.EmployerName,
                Offers.GdFolderId,
                Offers.GdDocumentId,
                Offers.resourcesGdFolderId,
                Offers.TenderUrl,
                Offers.InvitationMailId,
                OfferBonds.Id AS BondId,
                OfferBonds.Value AS BondValue,
                OfferBonds.Form AS BondForm,
                OfferBonds.PaymentData AS BondPaymentData,
                OfferBonds.Comment AS BondComment,
                OfferBonds.Status AS BondStatus,
                OfferBonds.ExpiryDate AS BondExpiryDate,
                
                -- Pobieramy dane z LastOfferEvent, a nie LatestOfferEvents
                LastOfferEvent.Id AS LastEventId,
                LastOfferEvent.EventType AS LastEventType,
                LastOfferEvent.Comment AS LastEventComment,
                LastOfferEvent.AdditionalMessage AS LastEventAdditionalMessage,
                LastOfferEvent.VersionNumber AS LastEventVersionNumber,
                LastOfferEvent.LastUpdated AS LastEventDate,
                LastOfferEvent.GdFilesJSON AS LastEventGdFilesJSON,
                LastOfferEvent.RecipientsJSON AS LastEventRecipientsJSON,

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
            LEFT JOIN Cities ON Cities.Id = Offers.CityId
            LEFT JOIN ContractTypes ON ContractTypes.Id = Offers.TypeId
            LEFT JOIN OfferBonds ON OfferBonds.OfferId = Offers.Id

            -- Podzapytanie, które zwraca dla każdej oferty (OfferId) największe Id z tabeli OfferEvents (najświeższe zdarzenie)
            LEFT JOIN (
                SELECT OfferId, MAX(Id) AS MaxEventId
                FROM OfferEvents
                GROUP BY OfferId
            ) AS LatestOfferEvents ON LatestOfferEvents.OfferId = Offers.Id

            -- Łączymy z tabelą OfferEvents, aby pobrać pełne dane o zdarzeniu na podstawie MaxEventId wyciągniętego w podzapytaniu
            LEFT JOIN OfferEvents AS LastOfferEvent ON LastOfferEvent.Id = LatestOfferEvents.MaxEventId

            -- Łączymy z tabelą Persons, aby pobrać informacje o osobie, która utworzyła zdarzenie
            LEFT JOIN Persons ON Persons.Id = LastOfferEvent.EditorId

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
        if (searchParams.statuses?.length) {
            const statusPlaceholders = searchParams.statuses
                .map(() => '?')
                .join(',');
            conditions.push(
                mysql.format(
                    `Offers.Status IN (${statusPlaceholders})`,
                    searchParams.statuses
                )
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

        if (searchParams.offerBondStatuses?.length) {
            const statusPlaceholders = searchParams.offerBondStatuses
                .map(() => '?')
                .join(',');
            conditions.push(
                mysql.format(
                    `OfferBonds.Status IN (${statusPlaceholders})`,
                    searchParams.offerBondStatuses
                )
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
                OR Offers.EmployerName LIKE ?
                OR Offers.Comment LIKE ?
                OR OfferBonds.Comment LIKE ?
                OR LastOfferEvent.Comment LIKE ?
                OR LastOfferEvent.AdditionalMessage LIKE ?
                OR LastOfferEvent.RecipientsJSON LIKE ?)`,
                [
                    `%${word}%`,
                    `%${word}%`,
                    `%${word}%`,
                    `%${word}%`,
                    `%${word}%`,
                    `%${word}%`,
                    `%${word}%`,
                    `%${word}%`,
                    `%${word}%`,
                ]
            )
        );

        const searchTextCondition = conditions.join(' AND ');
        return searchTextCondition;
    }
    static processOffersResult(result: any[]): Offer[] {
        let newResult: Offer[] = [];

        for (const row of result) {
            // Validate city data - handle NULL values from LEFT JOIN
            if (!row.CityId && (!row.CityName || !row.CityName.trim()))
                console.warn(
                    `Offer ${row.Id} has invalid city data - skipping`
                );

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
                invitationMailId: row.InvitationMailId,
                resourcesGdFolderId: row.resourcesGdFolderId,
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
                _lastEvent: new OfferEvent({
                    id: row.LastEventId,
                    offerId: row.Id,
                    eventType: row.LastEventType,
                    _lastUpdated: row.LastEventDate,
                    comment: ToolsDb.sqlToString(row.LastEventComment),
                    additionalMessage: ToolsDb.sqlToString(
                        row.LastEventAdditionalMessage
                    ),
                    versionNumber: row.LastEventVersionNumber,
                    _editor: {
                        id: row.EditorId,
                        name: ToolsDb.sqlToString(row.EditorName),
                        surname: ToolsDb.sqlToString(row.EditorSurname),
                        email: ToolsDb.sqlToString(row.EditorEmail),
                    },
                    gdFilesJSON: row.LastEventGdFilesJSON,
                    recipientsJSON: row.LastEventRecipientsJSON,
                }),
            };

            const item = row.IsOur
                ? new OurOffer(offerInitData)
                : new ExternalOffer(offerInitData);

            newResult.push(item);
        }
        return newResult;
    }

    static async makeNewCityObject(name: string) {
        const _city = new City({ name });
        await CitiesController.addNewCity(_city);
        console.log(
            'City added inDB with generated code:',
            _city.name,
            _city.code
        );
        return _city;
    }

    private static makeOfferBond(initData: OfferBondData, isOurOffer: boolean) {
        if (isOurOffer) return undefined;
        if (!initData.id) return null;
        return new OfferBond(initData);
    }
}
