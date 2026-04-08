import BaseRepository from '../repositories/BaseRepository';
import Invoice from './Invoice';
import Contract from '../contracts/Contract';
import Project from '../projects/Project';
import Person from '../persons/Person';
import ToolsDb from '../tools/ToolsDb';
import ContractOur from '../contracts/ContractOur';
import mysql from 'mysql2/promise';
import { CorrectionInvoiceSummary, InvoiceThirdPartyData } from '../types/types';

export interface InvoicesSearchParams {
    id?: number;
    projectId?: string;
    _project?: Project;
    contractId?: number;
    _contract?: Contract;
    searchText?: string;
    issueDateFrom?: string;
    issueDateTo?: string;
    statuses?: string[];
    ksefNumber?: string;
}

export default class InvoiceRepository extends BaseRepository<Invoice> {
    constructor() {
        super('Invoices');
    }

    protected mapRowToModel(row: any): Invoice {
        const contractInitParams = {
            id: row.ContractId,
            ourId: row.ContractOurId,
            number: row.ContractNumber,
            alias: row.ContractAlias,
            value: row.ContractValue,
            name: ToolsDb.sqlToString(row.ContractName),
            _totalNetValue: row.TotalValue,
            gdFolderId: row.ContractGdFolderId,
            _parent: {
                ourId: row.ProjectOurId,
                name: row.ProjectName,
                gdFolderId: row.ProjectGdFolderId,
            },
            _type: {
                id: row.ContractTypeId,
                name: row.ContractTypeName,
                description: row.ContractTypeDescription,
                isOur: row.ContractTypeIsOur,
            },
            _city: {
                id: row.CityId,
                name: row.CityName,
            },
        };
        const _contract = new ContractOur(contractInitParams);

        return new Invoice({
            id: row.Id,
            number: row.Number,
            description: ToolsDb.sqlToString(row.Description),
            status: row.Status,
            issueDate: row.IssueDate,
            sentDate: row.SentDate,
            daysToPay: row.DaysToPay,
            paymentDeadline: row.PaymentDeadline,
            gdId: row.GdId,
            ksefNumber: row.KsefNumber,
            ksefCorrectionType: row.KsefCorrectionType,
            ksefStatus: row.KsefStatus,
            ksefSessionId: row.KsefSessionId,
            ksefUpo: row.KsefUpo,
            isJstSubordinate: Boolean(row.IsJstSubordinate),
            isGvMember: row.IsGvMember === undefined || row.IsGvMember === null
                ? false
                : Boolean(row.IsGvMember),
            includeThirdParty: Boolean(row.IncludeThirdParty),
            thirdPartyEntityId: row.ThirdPartyEntityId,
            correctedInvoiceId: row.CorrectedInvoiceId,
            correctionReason: ToolsDb.sqlToString(row.CorrectionReason),
            _lastUpdated: row.LastUpdated,
            _entity: {
                id: row.EntityId,
                name: ToolsDb.sqlToString(row.EntityName),
                address: row.EntityAddress,
                taxNumber: row.EntityTaxNumber,
            },
            _contract: _contract,
            _thirdParty: row.ThirdPartyEntityId
                ? {
                    id: row.ThirdPartyEntityId,
                    name: ToolsDb.sqlToString(row.ThirdPartyEntityName),
                    address: row.ThirdPartyEntityAddress,
                    taxNumber: row.ThirdPartyEntityTaxNumber,
                }
                : undefined,
            _editor: {
                id: row.EditorId,
                name: row.EditorName,
                surname: row.EditorSurname,
                email: row.EditorEmail,
            },
            _owner: new Person({
                id: row.OwnerId,
                name: row.OwnerName,
                surname: row.OwnerSurname,
                email: row.OwnerEmail,
            }),
            _totalNetValue: row.TotalNetValue,
        });
    }

    async find(orConditions: InvoicesSearchParams[] = []) {
        const conditions =
            orConditions.length > 0
                ? this.makeOrGroupsConditions(
                      orConditions,
                      this.makeAndConditions.bind(this)
                  )
                : '1';

        const sql = `SELECT Invoices.Id,
            Invoices.Number,
            Invoices.Description,
            Invoices.Status,
            Invoices.CreationDate,
            Invoices.IssueDate,
            Invoices.SentDate,
            Invoices.DaysToPay,
            Invoices.PaymentDeadline,
            Invoices.GdId,
            Invoices.KsefNumber,
            Invoices.KsefCorrectionType,
            Invoices.KsefStatus,
            Invoices.KsefSessionId,
            Invoices.KsefUpo,
            Invoices.IsJstSubordinate,
            Invoices.IsGvMember,
            Invoices.IncludeThirdParty,
            Invoices.ThirdPartyEntityId,
            Invoices.CorrectedInvoiceId,
            Invoices.CorrectionReason,
            Invoices.LastUpdated,
            Invoices.ContractId,
            Entities.Id AS EntityId,
            Entities.Name AS EntityName,
            Entities.Address AS EntityAddress,
            Entities.TaxNumber AS EntityTaxNumber,
            ThirdPartyEntities.Name AS ThirdPartyEntityName,
            ThirdPartyEntities.Address AS ThirdPartyEntityAddress,
            ThirdPartyEntities.TaxNumber AS ThirdPartyEntityTaxNumber,
            Contracts.Number AS ContractNumber,
            Contracts.Name AS ContractName,
            Contracts.Value AS ContractValue,
            Contracts.Alias AS ContractAlias,
            Contracts.GdFolderId AS ContractGdFolderId,
            OurContractsData.OurId AS ContractOurId,
            ContractTypes.Id AS ContractTypeId,
            ContractTypes.Name AS ContractTypeName,
            ContractTypes.IsOur AS ContractTypeIsOur,
            ContractTypes.Id AS ContractTypeDescription,
            Projects.OurId AS ProjectOurId,
            Projects.Name AS ProjectName,
            Projects.GdFolderId AS ProjectGdFolderId,
            Cities.Id AS CityId,
            Cities.Name AS CityName,
            Editors.Id AS EditorId,
            Editors.Name AS EditorName,
            Editors.Surname AS EditorSurname,
            Editors.Email AS EditorEmail,
            Owners.Id AS OwnerId,
            Owners.Name AS OwnerName,
            Owners.Surname AS OwnerSurname,
            Owners.Email AS OwnerEmail,
            ROUND(SUM(InvoiceItems.Quantity * InvoiceItems.UnitPrice), 2) as TotalNetValue
        FROM Invoices
        JOIN Entities ON Entities.Id=Invoices.EntityId
        LEFT JOIN Entities AS ThirdPartyEntities ON ThirdPartyEntities.Id=Invoices.ThirdPartyEntityId
        JOIN Contracts ON Contracts.Id=Invoices.ContractId
        JOIN ContractTypes ON ContractTypes.Id = Contracts.TypeId
        JOIN OurContractsData ON OurContractsData.Id = Contracts.Id
        JOIN Projects ON Projects.OurId=Contracts.ProjectOurId
        LEFT JOIN Persons AS Editors ON Editors.Id=Invoices.EditorId
        LEFT JOIN Persons AS Owners ON Owners.Id=Invoices.OwnerId
        LEFT JOIN InvoiceItems ON InvoiceItems.ParentId = Invoices.Id
        LEFT JOIN Cities ON Cities.Id = OurContractsData.CityId
        WHERE ${conditions}
        GROUP BY Invoices.Id
        ORDER BY Invoices.IssueDate ASC`;

        const rows = await this.executeQuery(sql);
        const invoices = rows.map((row) => this.mapRowToModel(row));
        const invoiceIds = invoices
            .map((invoice) => invoice.id)
            .filter((id): id is number => typeof id === 'number');
        const thirdPartiesByInvoiceId = await this.findThirdPartiesBulk(invoiceIds);

        invoices.forEach((invoice) => {
            if (!invoice.id) {
                invoice._thirdParties = [];
                return;
            }

            const thirdParties = thirdPartiesByInvoiceId.get(invoice.id) || [];
            const hasLegacyThirdParty =
                Boolean(invoice.includeThirdParty) &&
                Boolean(invoice.thirdPartyEntityId || invoice._thirdParty?.id);

            if (thirdParties.length > 0) {
                invoice._thirdParties = thirdParties;
                invoice.includeThirdParty = true;
                invoice.thirdPartyEntityId = thirdParties[0].entityId ?? null;
                invoice._thirdParty = thirdParties[0]._entity;
            } else if (hasLegacyThirdParty) {
                const legacyEntityId =
                    invoice.thirdPartyEntityId ?? invoice._thirdParty?.id ?? null;
                const fallbackRole = invoice.isJstSubordinate
                    ? 8
                    : invoice.isGvMember
                      ? 10
                      : 10;

                invoice.includeThirdParty = true;
                invoice._thirdParties = legacyEntityId
                    ? [
                          {
                              entityId: legacyEntityId,
                              role: fallbackRole,
                              _entity: invoice._thirdParty,
                          },
                      ]
                    : [];
            } else {
                invoice.includeThirdParty = false;
                invoice.thirdPartyEntityId = null;
                invoice._thirdParty = undefined;
                invoice._thirdParties = [];
            }
        });

        return invoices;
    }

    async findThirdPartiesBulk(
        invoiceIds: number[]
    ): Promise<Map<number, InvoiceThirdPartyData[]>> {
        const result = new Map<number, InvoiceThirdPartyData[]>();
        if (!invoiceIds.length) {
            return result;
        }

        const placeholders = invoiceIds.map(() => '?').join(',');
        const sql = `SELECT
                InvoiceThirdParties.InvoiceId,
                InvoiceThirdParties.EntityId,
                InvoiceThirdParties.Role,
                InvoiceThirdParties.Position,
                Entities.Name AS EntityName,
                Entities.Address AS EntityAddress,
                Entities.TaxNumber AS EntityTaxNumber
            FROM InvoiceThirdParties
            JOIN Entities ON Entities.Id = InvoiceThirdParties.EntityId
            WHERE InvoiceThirdParties.InvoiceId IN (${placeholders})
            ORDER BY InvoiceThirdParties.InvoiceId, InvoiceThirdParties.Position ASC`;

        const rows = await this.executeQuery(mysql.format(sql, invoiceIds));
        rows.forEach((row) => {
            const invoiceId = Number(row.InvoiceId);
            if (!result.has(invoiceId)) {
                result.set(invoiceId, []);
            }

            result.get(invoiceId)!.push({
                entityId: row.EntityId,
                role: Number(row.Role),
                _entity: {
                    id: row.EntityId,
                    name: ToolsDb.sqlToString(row.EntityName),
                    address: row.EntityAddress,
                    taxNumber: row.EntityTaxNumber,
                },
            });
        });

        return result;
    }

    async replaceThirdPartiesInDb(
        invoiceId: number,
        thirdParties: InvoiceThirdPartyData[],
        externalConn?: mysql.PoolConnection,
    ): Promise<void> {
        if (!invoiceId) {
            throw new Error('Invoice id is required to replace third parties');
        }

        const conn = externalConn || (await ToolsDb.pool.getConnection());
        try {
            await conn.query('DELETE FROM InvoiceThirdParties WHERE InvoiceId = ?', [invoiceId]);

            if (!thirdParties.length) {
                return;
            }

            const insertSql = `
                INSERT INTO InvoiceThirdParties (InvoiceId, EntityId, Role, Position)
                VALUES (?, ?, ?, ?)
            `;

            for (let i = 0; i < thirdParties.length; i++) {
                const item = thirdParties[i];
                await conn.query(insertSql, [
                    invoiceId,
                    item.entityId,
                    item.role,
                    i + 1,
                ]);
            }
        } finally {
            if (!externalConn) {
                conn.release();
            }
        }
    }

    private makeSearchTextCondition(searchText: string | undefined) {
        if (!searchText) return '1';

        const words = searchText.toString().split(' ');
        const conditions = words.map(
            (word) =>
                `(Invoices.Number LIKE ${mysql.escape(`%${word}%`)}
                          OR Invoices.Description LIKE ${mysql.escape(
                              `%${word}%`
                          )}
                          OR Invoices.Status LIKE ${mysql.escape(`%${word}%`)}
                          OR Entities.Name LIKE ${mysql.escape(`%${word}%`)}
                          OR OurContractsData.OurId LIKE ${mysql.escape(
                              `%${word}%`
                          )}
                          OR Contracts.Number LIKE ${mysql.escape(`%${word}%`)}
                          OR Contracts.Name LIKE ${mysql.escape(`%${word}%`)}
                          OR Contracts.Alias LIKE ${mysql.escape(`%${word}%`)}
                          OR EXISTS (
                              SELECT 1 
                              FROM InvoiceItems
                              WHERE InvoiceItems.ParentId = Invoices.Id
                                  AND InvoiceItems.Description LIKE ${mysql.escape(
                                      `%${word}%`
                                  )}
                          ))`
        );

        return conditions.join(' AND ');
    }

    private makeAndConditions(searchParams: InvoicesSearchParams) {
        const conditions = [];

        if (searchParams.id) {
            conditions.push(mysql.format(`Invoices.Id = ?`, [searchParams.id]));
        }
        const projectOurId =
            searchParams._project?.ourId || searchParams.projectId;
        if (projectOurId) {
            conditions.push(
                mysql.format(`Contracts.ProjectOurId = ?`, [projectOurId])
            );
        }
        const contractId =
            searchParams._contract?.id || searchParams.contractId;
        if (contractId) {
            conditions.push(
                mysql.format(`Invoices.ContractId = ?`, [contractId])
            );
        }
        if (searchParams.issueDateFrom) {
            conditions.push(
                mysql.format(`Invoices.IssueDate >= ?`, [
                    searchParams.issueDateFrom,
                ])
            );
        }
        if (searchParams.issueDateTo) {
            conditions.push(
                mysql.format(`Invoices.IssueDate <= ?`, [
                    searchParams.issueDateTo,
                ])
            );
        }
        if (searchParams.statuses?.length) {
            const statusPlaceholders = searchParams.statuses
                .map(() => '?')
                .join(',');
            conditions.push(
                mysql.format(
                    `Invoices.Status IN (${statusPlaceholders})`,
                    searchParams.statuses
                )
            );
        }
        if (searchParams.ksefNumber) {
            conditions.push(
                mysql.format(`Invoices.KsefNumber = ?`, [searchParams.ksefNumber])
            );
        }
        const searchTextCondition = this.makeSearchTextCondition(
            searchParams.searchText
        );
        if (searchTextCondition !== '1') {
            conditions.push(searchTextCondition);
        }

        return conditions.length > 0 ? conditions.join(' AND ') : '1';
    }

    /**
     * Znajduje wszystkie faktury korygujące daną fakturę
     * @param originalInvoiceId - ID faktury oryginalnej
     * @returns Lista uproszczonych danych korekt
     */
    async findCorrections(originalInvoiceId: number): Promise<CorrectionInvoiceSummary[]> {
        const sql = mysql.format(`
            SELECT 
                Invoices.Id,
                Invoices.Number,
                Invoices.IssueDate,
                Invoices.CorrectionReason,
                ROUND(SUM(InvoiceItems.Quantity * InvoiceItems.UnitPrice), 2) as TotalNetValue
            FROM Invoices
            LEFT JOIN InvoiceItems ON InvoiceItems.ParentId = Invoices.Id
            WHERE Invoices.CorrectedInvoiceId = ?
            GROUP BY Invoices.Id
            ORDER BY Invoices.IssueDate DESC`, [originalInvoiceId]);

        const rows = await this.executeQuery(sql);
        return rows.map((row: any) => ({
            id: row.Id,
            number: row.Number,
            issueDate: row.IssueDate,
            correctionReason: row.CorrectionReason,
            _totalNetValue: row.TotalNetValue
        }));
    }

    /**
     * Pobiera korekty dla listy faktur (bulk)
     * @param invoiceIds - Lista ID faktur
     * @returns Mapa: invoiceId -> lista korekt
     */
    async findCorrectionsBulk(invoiceIds: number[]): Promise<Map<number, CorrectionInvoiceSummary[]>> {
        if (invoiceIds.length === 0) return new Map();

        const sql = mysql.format(`
            SELECT 
                Invoices.Id,
                Invoices.Number,
                Invoices.IssueDate,
                Invoices.CorrectionReason,
                Invoices.CorrectedInvoiceId,
                ROUND(SUM(InvoiceItems.Quantity * InvoiceItems.UnitPrice), 2) as TotalNetValue
            FROM Invoices
            LEFT JOIN InvoiceItems ON InvoiceItems.ParentId = Invoices.Id
            WHERE Invoices.CorrectedInvoiceId IN (?)
            GROUP BY Invoices.Id
            ORDER BY Invoices.IssueDate DESC`, [invoiceIds]);

        const rows = await this.executeQuery(sql);
        
        const result = new Map<number, CorrectionInvoiceSummary[]>();
        // Inicjalizuj pustą tablicę dla każdego invoiceId
        invoiceIds.forEach(id => result.set(id, []));
        
        rows.forEach((row: any) => {
            const originalId = row.CorrectedInvoiceId;
            const corrections = result.get(originalId) || [];
            corrections.push({
                id: row.Id,
                number: row.Number,
                issueDate: row.IssueDate,
                correctionReason: row.CorrectionReason,
                _totalNetValue: row.TotalNetValue
            });
            result.set(originalId, corrections);
        });

        return result;
    }
}
