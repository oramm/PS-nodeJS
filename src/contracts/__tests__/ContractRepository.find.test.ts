/// <reference types="jest" />
import { describe, expect, it, jest, afterEach } from '@jest/globals';
import ContractEntityAssociationsHelper from '../ContractEntityAssociationsHelper';
import ContractOther from '../ContractOther';
import ContractOur from '../ContractOur';
import ContractRepository from '../ContractRepository';

describe('ContractRepository.find', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('hydrates contractors for generic search results without project context', async () => {
        const repository = new ContractRepository();
        const executeQuerySpy = jest
            .spyOn(repository as any, 'executeQuery')
            .mockResolvedValue([
                {
                    Id: 11,
                    Alias: 'SUW Miękinia',
                    Number: '241/2024',
                    Name: 'Budowa nowej stacji uzdatniania wody',
                    OurIdRelated: null,
                    StartDate: '2024-08-19',
                    EndDate: '2026-08-19',
                    GuaranteeEndDate: null,
                    Value: null,
                    Comment: '',
                    Status: 'W trakcie',
                    GdFolderId: null,
                    MeetingProtocolsGdFolderId: null,
                    MaterialCardsGdFolderId: null,
                    LastUpdated: '2026-06-07 10:00:00',
                    OurId: null,
                    ManagerId: null,
                    AdminId: null,
                    CityId: null,
                    CityName: null,
                    CityCode: null,
                    ProjectId: 101,
                    ProjectOurId: 'MIE.GWS.02',
                    ProjectName: 'Projekt testowy',
                    ProjectAlias: 'PLAD OŚ, KS, SUW',
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
                    MainContractTypeId: 3,
                    TypeName: 'Żółty',
                    TypeIsOur: 0,
                    TypeDescription: 'Kontrakt na roboty projektuj i buduj',
                    ContractRangesNames: null,
                },
                {
                    Id: 12,
                    Alias: 'IK SUW',
                    Number: '',
                    Name: 'Inżynier kontraktu dla SUW',
                    OurIdRelated: null,
                    StartDate: '2024-08-19',
                    EndDate: '2026-08-19',
                    GuaranteeEndDate: null,
                    Value: null,
                    Comment: '',
                    Status: 'W trakcie',
                    GdFolderId: null,
                    MeetingProtocolsGdFolderId: null,
                    MaterialCardsGdFolderId: null,
                    LastUpdated: '2026-06-07 10:00:00',
                    OurId: 'MIE.IK.02',
                    ManagerId: 501,
                    AdminId: 502,
                    CityId: null,
                    CityName: null,
                    CityCode: null,
                    ProjectId: 101,
                    ProjectOurId: 'MIE.GWS.02',
                    ProjectName: 'Projekt testowy',
                    ProjectAlias: 'PLAD OŚ, KS, SUW',
                    ProjectGdFolderId: null,
                    RemainingNotScheduledValue: null,
                    RemainingNotIssuedValue: null,
                    AdminName: 'Anna',
                    AdminSurname: 'Admin',
                    AdminEmail: 'anna.admin@example.com',
                    ManagerName: 'Jan',
                    ManagerSurname: 'Manager',
                    ManagerEmail: 'jan.manager@example.com',
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
                    MainContractTypeId: 2,
                    TypeName: 'IK',
                    TypeIsOur: 1,
                    TypeDescription: 'Inżynier kontraktu',
                    ContractRangesNames: null,
                },
            ]);

        const associationsSpy = jest
            .spyOn(
                ContractEntityAssociationsHelper,
                'getContractEntityAssociationsList',
            )
            .mockResolvedValue([
                {
                    contractRole: 'CONTRACTOR',
                    _contract: { id: 11 },
                    _entity: {
                        id: 900,
                        name: 'Terlan Sp. z o.o.',
                    } as any,
                },
            ]);

        const result = await repository.find([{ searchText: 'ter' }]);

        expect(executeQuerySpy).toHaveBeenCalledTimes(1);
        expect(associationsSpy).toHaveBeenCalledWith({
            contractIds: [11, 12],
            isArchived: undefined,
        });

        const otherContract = result.find(
            (item) => item instanceof ContractOther,
        ) as ContractOther;
        const ourContract = result.find(
            (item) => item instanceof ContractOur,
        ) as ContractOur;

        expect(otherContract.alias).toBe('SUW Miękinia');
        expect(otherContract._contractors?.map((item) => item.name)).toEqual([
            'Terlan Sp. z o.o.',
        ]);
        expect(ourContract.ourId).toBe('MIE.IK.02');
        expect(ourContract._ourType).toBe('IK');
        expect(ourContract._ourIdOrNumber_Name).toContain('MIE.IK.02');
    });
});
