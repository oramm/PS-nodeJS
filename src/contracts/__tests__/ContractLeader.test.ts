/// <reference types="jest" />
/**
 * Lider konsorcjum - kolejność wykonawców i zapis znacznika.
 *
 * Dane wzorowane na kontrakcie 1767 (umowa 3/ZP/2024, alias „Z.2 OŚII"): wykonawcy
 * Terlan S.A. i WUPRINŻ S.A., liderem jest WUPRINŻ, czyli NIE ten, który wypada
 * pierwszy alfabetycznie. Człowiek nazwał tam folder ręcznie „K Z.2 OŚII WUPRINZ",
 * więc test sprawdza dokładnie to, co ma odtąd wychodzić samo z siebie.
 *
 * Sprawdzane są OBIE drogi, którymi dane wchodzą do PS - odczyt z bazy i żądanie
 * od klienta - bo to osobne ścieżki i jedna może działać, gdy druga nie.
 *
 * ToolsDb jest zamockowany na poziomie modułu, nie podmieniany metodą po metodzie:
 * domyślnym środowiskiem repo jest produkcja, więc test, który przypadkiem sięgnie
 * po prawdziwą pulę połączeń, sięga po bazę na kylosie.
 */
import {
    describe,
    expect,
    it,
    jest,
    beforeEach,
    afterEach,
} from '@jest/globals';
import ToolsDb from '../../tools/ToolsDb';
import ToolsGd from '../../tools/ToolsGd';
import ContractEntityAssociationsHelper from '../ContractEntityAssociationsHelper';
import ContractOther from '../ContractOther';
import ContractRepository from '../ContractRepository';
import ContractsController from '../ContractsController';
import MilestonesController from '../milestones/MilestonesController';

jest.mock('../../tools/ToolsDb');

const TERLAN = { id: 537, name: 'Terlan S.A.', shortName: 'Terlan' };
const WUPRINZ = { id: 265, name: 'WUPRINŻ S.A.', shortName: 'WUPRINZ' };

/** Wiersze zapisane przez kod produkcyjny - podstawa asercji o tym, co poszło do bazy. */
let insertedRows: { tableName: string; data: any }[] = [];

beforeEach(() => {
    insertedRows = [];
    const toolsDb = ToolsDb as jest.Mocked<typeof ToolsDb>;
    (toolsDb.sqlToString as any).mockImplementation((value: any) => value);
    (toolsDb.makeOrConditionFromValueOrArray as any).mockReturnValue('1');
    (toolsDb.getQueryCallbackAsync as any).mockResolvedValue([]);
    // Połączenie transakcyjne musi umieć `query`: od WYK-2B edycja umowy typu objętego
    // synchronizacją dociąga tym samym połączeniem znacznik „Objęta synchronizacją",
    // gdy żądanie go nie niesie (ContractsController.edit, krok 5). Pusty wynik znaczy
    // „umowy nie ma w bazie", czyli bramka zostaje zamknięta — dokładnie tak, jak te
    // testy zakładały wcześniej, gdy o wyniku rozstrzygało samo puste pole na obiekcie.
    // Ten plik sprawdza nazwę folderu i kolejność wykonawców, nie kolejkę wysyłkową.
    (toolsDb.transaction as any).mockImplementation(
        async (callback: any) =>
            await callback({
                query: async () => [[], undefined],
            } as any)
    );
    (toolsDb.addInDb as any).mockImplementation(
        async (tableName: string, data: any) => {
            insertedRows.push({ tableName, data: { ...data } });
            if (tableName === 'Contracts') data.id = 1767;
            return data;
        }
    );
});

afterEach(() => {
    jest.restoreAllMocks();
});

/** Wiersz kontraktu robót w kształcie, jaki oddaje zapytanie ContractRepository. */
function makeContractRow(overrides: Record<string, any> = {}) {
    return {
        Id: 1767,
        Alias: 'Z.2 OŚII',
        Number: '3/ZP/2024',
        Name: 'Września etap II',
        OurIdRelated: null,
        StartDate: '2024-01-01',
        EndDate: '2026-12-31',
        GuaranteeEndDate: null,
        Value: null,
        Comment: '',
        Status: 'W trakcie',
        GdFolderId: null,
        MeetingProtocolsGdFolderId: null,
        MaterialCardsGdFolderId: null,
        LastUpdated: '2026-08-22 10:00:00',
        OurId: null,
        ManagerId: null,
        AdminId: null,
        CityId: null,
        CityName: null,
        CityCode: null,
        ProjectId: 101,
        ProjectOurId: 'WRZ.GWS.01',
        ProjectName: 'Projekt testowy',
        ProjectAlias: 'Września',
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
        ...overrides,
    };
}

/** Powiązania w kolejności, w jakiej oddaje je baza: alfabetycznie po nazwie podmiotu. */
function makeAssociations(leaderEntityId?: number) {
    return [TERLAN, WUPRINZ].map((entity) => ({
        contractRole: 'CONTRACTOR' as const,
        isLeader: entity.id === leaderEntityId,
        _contract: { id: 1767 },
        _entity: entity as any,
    }));
}

async function findContract(
    leaderEntityId?: number,
    rowOverrides: Record<string, any> = {}
): Promise<ContractOther> {
    const repository = new ContractRepository();
    jest.spyOn(repository as any, 'executeQuery').mockResolvedValue([
        makeContractRow(rowOverrides),
    ]);
    jest.spyOn(
        ContractEntityAssociationsHelper,
        'getContractEntityAssociationsList'
    ).mockResolvedValue(makeAssociations(leaderEntityId));

    const result = await repository.find([{ id: 1767 }]);
    return result[0] as ContractOther;
}

describe('Lider konsorcjum - odczyt kontraktu z bazy', () => {
    it('stawia lidera na początku listy wykonawców i to jego skrót trafia do nazwy folderu', async () => {
        const contract = await findContract(WUPRINZ.id);

        expect(contract._contractors?.map((item) => item.id)).toEqual([
            WUPRINZ.id,
            TERLAN.id,
        ]);
        expect(contract._leaderEntityId).toBe(WUPRINZ.id);
        expect(contract._folderName).toBe('K Z.2 OŚII WUPRINZ');
    });

    it('bez wskazanego lidera zachowuje się jak dotąd - pierwszy jest pierwszy alfabetycznie', async () => {
        const contract = await findContract(undefined);

        expect(contract._contractors?.map((item) => item.id)).toEqual([
            TERLAN.id,
            WUPRINZ.id,
        ]);
        expect(contract._leaderEntityId).toBeUndefined();
        expect(contract._folderName).toBe('K Z.2 OŚII Terlan');
    });
});

describe('Lider konsorcjum - kontrakt budowany z żądania', () => {
    /** Osobna ścieżka niż odczyt z bazy: nazwa NOWEGO folderu powstaje właśnie tutaj. */
    function makeFromRequest(leaderEntityId?: number) {
        return new ContractOther({
            alias: 'Z.2 OŚII',
            number: '3/ZP/2024',
            name: 'Września etap II',
            status: 'W trakcie',
            comment: '',
            _type: { id: 3, name: 'Żółty', isOur: false },
            _project: { id: 101, ourId: 'WRZ.GWS.01' },
            _contractors: [TERLAN, WUPRINZ],
            _leaderEntityId: leaderEntityId,
        } as any);
    }

    it('nazwa folderu niesie skrót lidera, choć w żądaniu jest on drugi', () => {
        const contract = makeFromRequest(WUPRINZ.id);

        expect(contract._contractors?.map((item) => item.id)).toEqual([
            WUPRINZ.id,
            TERLAN.id,
        ]);
        expect(contract._folderName).toBe('K Z.2 OŚII WUPRINZ');
    });

    it('bez lidera kolejność z żądania zostaje nietknięta', () => {
        const contract = makeFromRequest(undefined);

        expect(contract._contractors?.map((item) => item.id)).toEqual([
            TERLAN.id,
            WUPRINZ.id,
        ]);
        expect(contract._folderName).toBe('K Z.2 OŚII Terlan');
    });
});

describe('Lider konsorcjum - zapis kontraktu', () => {
    function makeContractToSave(leaderEntityId?: number) {
        return new ContractOther({
            alias: 'Z.2 OŚII',
            number: '3/ZP/2024',
            name: 'Września etap II',
            status: 'W trakcie',
            comment: '',
            startDate: '2024-01-01',
            endDate: '2026-12-31',
            // Typ spoza integracji AQM/FIDman - zapis nie ma wołać żadnego outboxu.
            _type: { id: 2, name: 'IK', isOur: false },
            _project: { id: 101, ourId: 'WRZ.GWS.01' },
            projectOurId: 'WRZ.GWS.01',
            _contractors: [TERLAN, WUPRINZ],
            _leaderEntityId: leaderEntityId,
        } as any);
    }

    function contractorRows() {
        return insertedRows.filter(
            (row) =>
                row.tableName === 'Contracts_Entities' &&
                row.data.contractRole === 'CONTRACTOR'
        );
    }

    it('zapisuje znacznik lidera przy właściwym podmiocie', async () => {
        await ContractsController.add(makeContractToSave(WUPRINZ.id));

        const rows = contractorRows();
        expect(rows.map((row) => row.data.entityId)).toEqual([
            WUPRINZ.id,
            TERLAN.id,
        ]);
        expect(
            rows
                .filter((row) => row.data.isLeader)
                .map((row) => row.data.entityId)
        ).toEqual([WUPRINZ.id]);
    });

    it('bez wskazanego lidera żaden wiersz nie dostaje znacznika', async () => {
        await ContractsController.add(makeContractToSave(undefined));

        const rows = contractorRows();
        expect(rows.map((row) => row.data.entityId)).toEqual([
            TERLAN.id,
            WUPRINZ.id,
        ]);
        expect(rows.every((row) => row.data.isLeader === false)).toBe(true);
    });

    it('odmawia zapisu, gdy wskazany lider nie jest wykonawcą - i nic nie zapisuje', async () => {
        // Podmiot 1 („ENVI") występuje przy kontraktach jako inżynier, nie wykonawca.
        const contract = makeContractToSave(1);

        await expect(ContractsController.add(contract)).rejects.toThrow(
            /Liderem konsorcjum może być tylko firma z listy wykonawców/
        );

        expect(insertedRows).toHaveLength(0);
        expect(ToolsDb.transaction).not.toHaveBeenCalled();
    });
});

/**
 * LDR-5 - bramka przemianowania istniejącego folderu, wariant (b).
 *
 * Scenariusz jest realny, nie laboratoryjny: na Dysku stoi folder nazwany RĘCZNIE
 * po liderze („K Z.2 OŚII WUPRINZ"), a ktoś zmienia w PS alias umowy. Pytanie brzmi,
 * czy zapis kontraktu wolno wtedy przemianować cudzy folder.
 *
 * Sam brak wywołania ToolsGd.updateFolder niczego by nie dowodził, więc każdy przypadek
 * sprawdza, CO STAŁO SIĘ Z NAZWĄ: albo folder wraca z Dysku z nazwą nietkniętą, albo
 * do zapisu idzie konkretna nowa nazwa niosąca skrót LIDERA, a nie pierwszego z brzegu.
 *
 * Obie drogi powstawania kontraktu mają własne przypadki (odczyt z bazy i żądanie od
 * klienta), bo to osobne ścieżki - bramka działająca tylko w jednej z nich byłaby
 * niepełna, a stawką jest nieodwracalna zmiana nazwy folderu klienta.
 */
describe('Lider konsorcjum - bramka przemianowania istniejącego folderu (LDR-5)', () => {
    const GD_FOLDER_ID = 'contract-folder-1767';
    /** Nazwa, którą człowiek nadał ręcznie po liderze - ta stoi dziś na Dysku. */
    const NAZWA_NA_DYSKU = 'K Z.2 OŚII WUPRINZ';
    /** Alias zmieniony w PS - to on sprawia, że wyliczona nazwa różni się od tej z Dysku. */
    const ALIAS_PO_ZMIANIE = 'Z.2 OŚII etap B';

    let updateFolderSpy: any;

    beforeEach(() => {
        jest.spyOn(ToolsGd, 'getFileOrFolderMetaDataById').mockResolvedValue({
            id: GD_FOLDER_ID,
            name: NAZWA_NA_DYSKU,
        } as any);
        updateFolderSpy = jest
            .spyOn(ToolsGd, 'updateFolder')
            .mockResolvedValue({} as any);
    });

    /** Kontrakt z żądania od klienta - druga droga, obok odczytu z bazy. */
    function makeFromRequest(contractors: any[], leaderEntityId?: number) {
        return new ContractOther({
            id: 1767,
            alias: ALIAS_PO_ZMIANIE,
            number: '3/ZP/2024',
            name: 'Września etap II',
            status: 'W trakcie',
            comment: '',
            gdFolderId: GD_FOLDER_ID,
            _type: { id: 3, name: 'Żółty', isOur: false },
            _project: { id: 101, ourId: 'WRZ.GWS.01' },
            _contractors: contractors,
            _leaderEntityId: leaderEntityId,
        } as any);
    }

    describe('kontrakt odczytany z bazy', () => {
        async function findForFolder(leaderEntityId?: number) {
            return await findContract(leaderEntityId, {
                Alias: ALIAS_PO_ZMIANIE,
                GdFolderId: GD_FOLDER_ID,
            });
        }

        it('BEZ wskazanego lidera nie rusza nazwy nadanej przez człowieka', async () => {
            const contract = await findForFolder(undefined);
            // Gdyby bramka puściła, na Dysku wylądowałaby ta nazwa - z aliasem po zmianie
            // i ze skrótem firmy, która liderem nie jest.
            expect(contract._folderName).toBe('K Z.2 OŚII etap B Terlan');

            const folder = await contract.editFolder({} as any);

            expect(updateFolderSpy).not.toHaveBeenCalled();
            expect((folder as any).name).toBe(NAZWA_NA_DYSKU);
        });

        it('ZE wskazanym liderem przemianowuje folder na nazwę ze skrótem lidera', async () => {
            const contract = await findForFolder(WUPRINZ.id);

            await contract.editFolder({} as any);

            expect(updateFolderSpy).toHaveBeenCalledTimes(1);
            expect(updateFolderSpy).toHaveBeenCalledWith(expect.anything(), {
                id: GD_FOLDER_ID,
                name: 'K Z.2 OŚII etap B WUPRINZ',
            });
            const zapisanaNazwa = updateFolderSpy.mock.calls[0][1].name;
            expect(zapisanaNazwa).not.toBe(NAZWA_NA_DYSKU);
            expect(zapisanaNazwa).not.toContain(TERLAN.shortName);
        });
    });

    describe('kontrakt zbudowany z żądania od klienta', () => {
        it('BEZ wskazanego lidera nie rusza nazwy nadanej przez człowieka', async () => {
            const contract = makeFromRequest([TERLAN, WUPRINZ], undefined);
            expect(contract._folderName).toBe('K Z.2 OŚII etap B Terlan');

            const folder = await contract.editFolder({} as any);

            expect(updateFolderSpy).not.toHaveBeenCalled();
            expect((folder as any).name).toBe(NAZWA_NA_DYSKU);
        });

        it('ZE wskazanym liderem przemianowuje folder na nazwę ze skrótem lidera', async () => {
            // W żądaniu lider jest DRUGI - model stawia go na czele listy.
            const contract = makeFromRequest([TERLAN, WUPRINZ], WUPRINZ.id);

            await contract.editFolder({} as any);

            expect(updateFolderSpy).toHaveBeenCalledTimes(1);
            expect(updateFolderSpy).toHaveBeenCalledWith(expect.anything(), {
                id: GD_FOLDER_ID,
                name: 'K Z.2 OŚII etap B WUPRINZ',
            });
            expect(updateFolderSpy.mock.calls[0][1].name).not.toContain(
                TERLAN.shortName
            );
        });
    });

    it('jeden wykonawca - przemianowuje jak dotąd, bez żadnego wskazania lidera', async () => {
        const contract = makeFromRequest([TERLAN], undefined);

        await contract.editFolder({} as any);

        expect(updateFolderSpy).toHaveBeenCalledWith(expect.anything(), {
            id: GD_FOLDER_ID,
            name: 'K Z.2 OŚII etap B Terlan',
        });
    });
});

/**
 * Edycja istniejącego kontraktu - tu przemianowuje się folder, który już stoi na Dysku,
 * więc tu jest realna stawka. Blok dopisany po niezależnym przeglądzie diffu, który
 * znalazł rozjazd: edycja częściowa nietykająca powiązań nie zapisywała znacznika
 * lidera w bazie, ale wskazanie z żądania i tak otwierało bramkę przemianowania.
 *
 * Para przypadków, nie jeden: sam brak wywołania niczego nie dowodzi, więc obok kontroli
 * negatywnej stoi kontrola pozytywna, gdzie pełny zapis przemianowuje folder i zapisuje
 * znacznik.
 */
describe('Lider konsorcjum - edycja kontraktu a nazwa folderu na Dysku', () => {
    const GD_FOLDER_ID = 'contract-folder-1767';
    const NAZWA_NA_DYSKU = 'K Z.2 OŚII WUPRINZ';
    const ALIAS_PO_ZMIANIE = 'Z.2 OŚII etap B';
    /** Autoryzacja jest tylko znacznikiem „wolno ruszać Dysk" - żadnego wywołania sieci. */
    const mockAuth = { mocked: true } as any;

    let updateFolderSpy: any;

    beforeEach(() => {
        jest.spyOn(ToolsGd, 'getFileOrFolderMetaDataById').mockResolvedValue({
            id: GD_FOLDER_ID,
            name: NAZWA_NA_DYSKU,
        } as any);
        updateFolderSpy = jest
            .spyOn(ToolsGd, 'updateFolder')
            .mockResolvedValue({} as any);
        // Arkusz Scrum i foldery kamieni są poza tematem tego testu i chodzą po sieci.
        jest.spyOn(ContractOther.prototype, 'editInScrum').mockResolvedValue(
            false
        );
        jest.spyOn(
            MilestonesController,
            'ensureApprovedDocsFolders'
        ).mockResolvedValue(undefined as any);
    });

    function makeContractToEdit(leaderEntityId?: number | string) {
        return new ContractOther({
            id: 1767,
            alias: ALIAS_PO_ZMIANIE,
            number: '3/ZP/2024',
            name: 'Września etap II',
            status: 'W trakcie',
            comment: '',
            startDate: '2024-01-01',
            endDate: '2026-12-31',
            gdFolderId: GD_FOLDER_ID,
            // Typ spoza integracji AQM/FIDman - zapis nie ma wołać żadnego outboxu.
            _type: { id: 2, name: 'IK', isOur: false },
            _project: { id: 101, ourId: 'WRZ.GWS.01' },
            projectOurId: 'WRZ.GWS.01',
            _contractors: [TERLAN, WUPRINZ],
            _leaderEntityId: leaderEntityId,
        } as any);
    }

    function contractorRows() {
        return insertedRows.filter(
            (row) =>
                row.tableName === 'Contracts_Entities' &&
                row.data.contractRole === 'CONTRACTOR'
        );
    }

    it('edycja częściowa spoza pól powiązań NIE przemianowuje folderu na wskazanego lidera', async () => {
        // `alias` nie jest polem „tylko do bazy", więc krok folderowy się wykonuje.
        // Powiązania natomiast NIE są przepisywane, czyli znacznik lidera w bazie
        // zostaje stary - i właśnie dlatego wskazanie z żądania nie ma prawa nic otworzyć.
        const contract = makeContractToEdit(WUPRINZ.id);

        await ContractsController.edit(contract, mockAuth, ['alias']);

        expect(updateFolderSpy).not.toHaveBeenCalled();
        expect(contractorRows()).toHaveLength(0);
    });

    it('pełny zapis ze wskazanym liderem przemianowuje folder I zapisuje znacznik', async () => {
        const contract = makeContractToEdit(WUPRINZ.id);

        await ContractsController.edit(contract, mockAuth);

        expect(updateFolderSpy).toHaveBeenCalledTimes(1);
        expect(updateFolderSpy).toHaveBeenCalledWith(expect.anything(), {
            id: GD_FOLDER_ID,
            name: `K ${ALIAS_PO_ZMIANIE} ${WUPRINZ.shortName}`,
        });
        expect(
            contractorRows()
                .filter((row) => row.data.isLeader)
                .map((row) => row.data.entityId)
        ).toEqual([WUPRINZ.id]);
    });

    it('identyfikator lidera podany jako napis działa tak samo jak liczba', async () => {
        const contract = makeContractToEdit(String(WUPRINZ.id));

        await ContractsController.edit(contract, mockAuth);

        expect(contract._contractors?.[0]?.id).toBe(WUPRINZ.id);
        expect(updateFolderSpy).toHaveBeenCalledWith(expect.anything(), {
            id: GD_FOLDER_ID,
            name: `K ${ALIAS_PO_ZMIANIE} ${WUPRINZ.shortName}`,
        });
        expect(
            contractorRows()
                .filter((row) => row.data.isLeader)
                .map((row) => row.data.entityId)
        ).toEqual([WUPRINZ.id]);
    });

    it('wskazanie lidera, które nie jest liczbą, jest odrzucane komunikatem o typie', async () => {
        const contract = makeContractToEdit('nie-liczba');

        await expect(
            ContractsController.edit(contract, mockAuth)
        ).rejects.toThrow(/nie jest identyfikatorem podmiotu/);

        expect(updateFolderSpy).not.toHaveBeenCalled();
        expect(insertedRows).toHaveLength(0);
    });

    it('kontrakt bez ani jednego wykonawcy nie rusza nazwy nadanej przez człowieka', async () => {
        // Pusta lista to „nie wiem, kto jest wykonawcą": wyliczona nazwa byłaby
        // `K <alias>` bez skrótu firmy i skasowałaby nazwę nadaną ręcznie po liderze.
        const contract = new ContractOther({
            id: 1767,
            alias: ALIAS_PO_ZMIANIE,
            number: '3/ZP/2024',
            name: 'Września etap II',
            status: 'W trakcie',
            comment: '',
            gdFolderId: GD_FOLDER_ID,
            _type: { id: 2, name: 'IK', isOur: false },
            _project: { id: 101, ourId: 'WRZ.GWS.01' },
            _contractors: [],
        } as any);
        expect(contract._folderName).toBe(`K ${ALIAS_PO_ZMIANIE}`);

        const folder = await contract.editFolder(mockAuth);

        expect(updateFolderSpy).not.toHaveBeenCalled();
        expect((folder as any).name).toBe(NAZWA_NA_DYSKU);
    });
});
