/**
 * F1 — PS ENVI "Nabywca/Odbiorca FV" plan, checkpoint F1.
 * Plan: 20_projects/Aplikacje/AQM.APP.01/plans/2026-07-16-psenvi-fv-nabywca-odbiorca-plan.md
 *
 * Coverage: ContractRepository write/read/NULL round-trip for the new optional
 * OurContractsData.InvoiceBuyerEntityId column (D1/D5 — additive, opt-in FK to
 * Entities, no automatic backfill).
 *
 *  (a) addInDb: `_invoiceBuyer` on a ContractOur → InvoiceBuyerEntityId persisted
 *      in OurContractsData, NOT in Contracts.
 *  (b) addInDb: no `_invoiceBuyer` → field stays unset (NULL by omission, no DB write).
 *  (c) editInDb: fieldsToUpdate=['invoiceBuyerEntityId'] with an explicit `null`
 *      clears the field and touches ONLY OurContractsData (Contracts table update
 *      is skipped since no Contracts-table field is in fieldsToUpdate).
 *  (d) find()/mapRowToModel: SELECT row with InvoiceBuyer* columns populated →
 *      `_invoiceBuyer` hydrated; row with NULL InvoiceBuyer* columns → `_invoiceBuyer`
 *      and `invoiceBuyerEntityId` both undefined.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('../../tools/ToolsDb');

import ToolsDb from '../../tools/ToolsDb';
import ContractOur from '../ContractOur';
import ContractRepository from '../ContractRepository';
import ContractEntityAssociationsHelper from '../ContractEntityAssociationsHelper';

describe('ContractRepository — InvoiceBuyerEntityId write/read/NULL round-trip (F1)', () => {
    let savedContractsData: any = null;
    let savedOurContractsData: any = null;

    beforeEach(() => {
        jest.clearAllMocks();
        savedContractsData = null;
        savedOurContractsData = null;

        // ToolsDb is auto-mocked (jest.mock at top) for the write tests below;
        // sqlToString is used read-only in mapRowToModel()/mapInvoiceBuyerToModel(),
        // so give it its real (identity-ish) behavior for the find() tests.
        (ToolsDb.sqlToString as any).mockImplementation((s: string) => s ?? '');
        (ToolsDb.addInDb as any).mockImplementation(
            async (tableName: string, data: any) => {
                if (tableName === 'Contracts') {
                    savedContractsData = { ...data };
                    data.id = 4242;
                } else if (tableName === 'OurContractsData') {
                    savedOurContractsData = { ...data };
                }
                return data;
            },
        );
        (ToolsDb.editInDb as any).mockImplementation(
            async (tableName: string, data: any) => {
                if (tableName === 'Contracts') {
                    savedContractsData = { ...data };
                } else if (tableName === 'OurContractsData') {
                    savedOurContractsData = { ...data };
                }
                return data;
            },
        );
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    const makeOurContract = (overrides: any = {}) =>
        new ContractOur({
            id: 4242,
            ourId: 'WAW.UR.001',
            _type: { id: 1, name: 'UR', isOur: true },
            typeId: 1,
            number: '001',
            name: 'Testowy kontrakt JST',
            startDate: '2026-01-01',
            endDate: '2026-12-31',
            status: 'W trakcie',
            _project: { id: 1, ourId: 'PRJ-001', gdFolderId: 'gd-1' },
            projectOurId: 'PRJ-001',
            adminId: 10,
            managerId: 20,
            ...overrides,
        });

    describe('addInDb', () => {
        it('persists invoiceBuyerEntityId in OurContractsData (not Contracts) when _invoiceBuyer is set', async () => {
            const repository = new ContractRepository();
            const contract = makeOurContract({
                _invoiceBuyer: {
                    id: 900,
                    name: 'Gmina Duszniki',
                    address: 'ul. Sportowa 1, 64-550 Duszniki',
                    taxNumber: '7871995455',
                },
            });
            expect(contract.invoiceBuyerEntityId).toBe(900);

            await repository.addInDb(contract as any);

            expect(savedOurContractsData).not.toBeNull();
            expect(savedOurContractsData.invoiceBuyerEntityId).toBe(900);
            expect(savedContractsData.invoiceBuyerEntityId).toBeUndefined();
        });

        it('leaves invoiceBuyerEntityId unset when no _invoiceBuyer is provided (NULL by omission)', async () => {
            const repository = new ContractRepository();
            const contract = makeOurContract();
            expect(contract.invoiceBuyerEntityId).toBeUndefined();

            await repository.addInDb(contract as any);

            expect(savedOurContractsData).not.toBeNull();
            expect(savedOurContractsData.invoiceBuyerEntityId).toBeUndefined();
        });
    });

    describe('editInDb', () => {
        it('fieldsToUpdate=[invoiceBuyerEntityId] with explicit null clears the field, touching only OurContractsData', async () => {
            const repository = new ContractRepository();
            const contract = makeOurContract({ invoiceBuyerEntityId: null });

            await repository.editInDb(
                contract as any,
                undefined,
                false,
                ['invoiceBuyerEntityId'],
            );

            expect(savedOurContractsData).not.toBeNull();
            expect(savedOurContractsData.invoiceBuyerEntityId).toBeNull();
            expect(savedOurContractsData.id).toBe(4242);
            // Contracts-table update must NOT run: no Contracts-table field was
            // requested (ourContractFieldsToUpdate absorbed the whole request).
            expect(savedContractsData).toBeNull();
            expect(ToolsDb.editInDb).toHaveBeenCalledTimes(1);
        });

        it('fieldsToUpdate=[invoiceBuyerEntityId] with a value writes it to OurContractsData', async () => {
            const repository = new ContractRepository();
            const contract = makeOurContract({
                _invoiceBuyer: { id: 901, name: 'Gmina Duszniki (nowy podmiot)' },
            });

            await repository.editInDb(
                contract as any,
                undefined,
                false,
                ['invoiceBuyerEntityId'],
            );

            expect(savedOurContractsData.invoiceBuyerEntityId).toBe(901);
        });
    });

    describe('find() / mapRowToModel — InvoiceBuyer* SELECT mapping', () => {
        afterEach(() => {
            jest.restoreAllMocks();
        });

        const baseRow = {
            Id: 55,
            Alias: 'JST-TEST',
            Number: null,
            Name: 'Umowa JST testowa',
            OurIdRelated: null,
            StartDate: '2026-01-01',
            EndDate: '2026-12-31',
            GuaranteeEndDate: null,
            Value: null,
            Comment: '',
            Status: 'W trakcie',
            GdFolderId: null,
            MeetingProtocolsGdFolderId: null,
            MaterialCardsGdFolderId: null,
            LastUpdated: '2026-07-16 10:00:00',
            OurId: 'WAW.UR.001',
            ManagerId: null,
            AdminId: null,
            CityId: null,
            CityName: null,
            CityCode: null,
            ProjectId: 1,
            ProjectOurId: 'PRJ-001',
            ProjectName: 'Projekt testowy',
            ProjectAlias: 'Alias',
            ProjectGdFolderId: null,
            RemainingNotScheduledValue: null,
            RemainingNotIssuedValue: null,
            AdminName: null,
            AdminSurname: null,
            AdminEmail: null,
            ManagerName: null,
            ManagerSurname: null,
            ManagerEmail: null,
            RelatedId: null,
            RelatedName: null,
            RelatedGdFolderId: null,
            RelatedOurId: null,
            RelatedManagerId: null,
            RelatedManagerName: null,
            RelatedManagerSurname: null,
            RelatedManagerEmail: null,
            RelatedAdminId: null,
            RelatedAdminName: null,
            RelatedAdminSurname: null,
            RelatedAdminEmail: null,
            MainContractTypeId: 1,
            TypeName: 'UR',
            TypeIsOur: 1,
            TypeDescription: 'Umowa ENVI',
            ContractRangesNames: null,
        };

        it('hydrates _invoiceBuyer when InvoiceBuyer* columns are populated', async () => {
            const repository = new ContractRepository();
            // searchParams.id set → find() also queries ContractRangeContractRepository
            // via ToolsDb.getQueryCallbackAsync; ToolsDb is auto-mocked (jest.mock at
            // top of file), so give it an empty result explicitly.
            (ToolsDb.getQueryCallbackAsync as any).mockResolvedValue([]);
            jest.spyOn(repository as any, 'executeQuery').mockResolvedValue([
                {
                    ...baseRow,
                    InvoiceBuyerEntityId: 900,
                    InvoiceBuyerId: 900,
                    InvoiceBuyerName: 'Gmina Duszniki',
                    InvoiceBuyerAddress: 'ul. Sportowa 1, 64-550 Duszniki',
                    InvoiceBuyerTaxNumber: '7871995455',
                },
            ]);
            jest.spyOn(
                ContractEntityAssociationsHelper,
                'getContractEntityAssociationsList',
            ).mockResolvedValue([]);

            const [result] = (await repository.find([
                { id: 55 },
            ])) as ContractOur[];

            expect(result.invoiceBuyerEntityId).toBe(900);
            expect(result._invoiceBuyer?.id).toBe(900);
            expect(result._invoiceBuyer?.name).toBe('Gmina Duszniki');
            expect(result._invoiceBuyer?.taxNumber).toBe('7871995455');
        });

        it('leaves _invoiceBuyer and invoiceBuyerEntityId undefined when InvoiceBuyer* columns are NULL', async () => {
            const repository = new ContractRepository();
            (ToolsDb.getQueryCallbackAsync as any).mockResolvedValue([]);
            jest.spyOn(repository as any, 'executeQuery').mockResolvedValue([
                {
                    ...baseRow,
                    InvoiceBuyerEntityId: null,
                    InvoiceBuyerId: null,
                    InvoiceBuyerName: null,
                    InvoiceBuyerAddress: null,
                    InvoiceBuyerTaxNumber: null,
                },
            ]);
            jest.spyOn(
                ContractEntityAssociationsHelper,
                'getContractEntityAssociationsList',
            ).mockResolvedValue([]);

            const [result] = (await repository.find([
                { id: 55 },
            ])) as ContractOur[];

            expect(result.invoiceBuyerEntityId).toBeUndefined();
            expect(result._invoiceBuyer).toBeUndefined();
        });
    });
});
