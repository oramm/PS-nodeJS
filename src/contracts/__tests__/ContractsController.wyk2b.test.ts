/**
 * WYK-2B — cisza w żądaniu znaczy „sprawdź w bazie", a nie „wykluczona".
 * Plan: 20_projects/Aplikacje/PS.APP.01/plans/2026-08-23-wyk-wykluczenia-synchronizacji-plan.md
 *
 * PS ma dwie trasy zapisu umowy. Formularz (`PUT /contract/:id`) niesie znacznik „Objęta
 * synchronizacją"; ekran terminów i pulpit (`PUT /milestoneDateContract/:id`) składają umowę
 * z cienkiego obiektu, w którym znacznika nie ma — a obie wołają ContractsController.edit().
 * Po WYK-1 bramka czytała ten brak jako „wykluczona" i umowa WŁĄCZONA zapisana trasą terminów
 * po cichu przestawała jechać do FIDmana. Nie jest to utrata danych (kolumna w bazie zostaje
 * nietknięta), tylko utrata wysyłki, więc nic tego nie zgłasza.
 *
 * Rozstrzygnięcie właściciela 2026-08-24 (wariant B): przy ciszy w żądaniu serwer odczytuje
 * znacznik z bazy. Jawne `false` dalej wygrywa, a ścieżka DODANIA zostaje bez zmian — nowa
 * umowa nie ma jeszcze czego czytać, więc rodzi się wykluczona.
 *
 * Bramka `isFidmanSyncEligible` i odczyt `readContractFidmanSyncEnabled` są tu PRAWDZIWE
 * (podstawione z jest.requireActual pod zamockowany moduł) — o wyniku rozstrzyga naprawdę
 * reguła i naprawdę wykonany SELECT, a nie mock testu. Zamockowane zostaje wyłącznie
 * `enqueueFidmanContractPush`, żeby dało się policzyć wejścia do kolejki.
 *
 * Red-without-fix: cofnięcie zmiany w ContractsController.edit() (powrót do
 * `isFidmanSyncEligible(contract)`) zapala pierwszy test. Zamiana warunku `=== undefined`
 * na sprawdzanie fałszywości zapala test jawnego `false`. Wpisanie odczytanej wartości na
 * obiekt umowy zapala test pułapki 1. Dociągnięcie wartości także przy dodaniu zapala test
 * ścieżki dodania.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../tools/ToolsDb');
jest.mock('../../tools/Tools');
jest.mock('../ContractEntityRepository');
jest.mock('../contractRangesContracts/ContractRangeContractRepository');
jest.mock('../../ScrumSheet/CurrentSprintValidator');
jest.mock('../../setup/Sessions/IntersessionsTasksStore');
jest.mock('../fidmanSync/FidmanSync');

import ToolsDb from '../../tools/ToolsDb';
import Tools from '../../tools/Tools';
import CurrentSprintValidator from '../../ScrumSheet/CurrentSprintValidator';
import TaskStore from '../../setup/Sessions/IntersessionsTasksStore';
import * as FidmanSync from '../fidmanSync/FidmanSync';

/** Wiersz, który zwróci SELECT na Contracts. `null` = umowy o tym Id w bazie nie ma. */
type DbFlag = 0 | 1 | null;

describe('ContractsController.edit() — WYK-2B: znacznik nieodesłany w żądaniu dociągany z bazy', () => {
    let mockConn: any;
    let dbFlag: DbFlag;
    /** Wartość pola w chwili, gdy obiekt szedł do warstwy zapisu (pułapka 1). */
    let fidmanSyncEnabledAtWrite: unknown;

    beforeEach(() => {
        jest.clearAllMocks();
        dbFlag = 0;
        fidmanSyncEnabledAtWrite = 'NIE ZAPISANO';

        const realFidmanSync = jest.requireActual(
            '../fidmanSync/FidmanSync'
        ) as typeof FidmanSync;
        (FidmanSync.isFidmanSyncEligible as any).mockImplementation(
            realFidmanSync.isFidmanSyncEligible
        );
        (FidmanSync.readContractFidmanSyncEnabled as any).mockImplementation(
            realFidmanSync.readContractFidmanSyncEnabled
        );

        mockConn = {
            beginTransaction: jest.fn(),
            commit: jest.fn(),
            rollback: jest.fn(),
            release: jest.fn(),
            // Jedyne zapytanie idące tą drogą to odczyt znacznika z WYK-2B — reszta
            // warstwy zapisu jest zamockowana. Dlatego liczba wywołań `query` jest
            // wprost odpowiedzią na pytanie „czy serwer sięgnął do bazy po znacznik".
            query: jest.fn(async () => [
                dbFlag === null ? [] : [{ FidmanSyncEnabled: dbFlag }],
                undefined,
            ]),
        };

        (ToolsDb.getQueryCallbackAsync as any).mockResolvedValue([]);
        (ToolsDb.transaction as jest.Mock).mockImplementation(
            async (callback: any) => callback(mockConn)
        );
        (ToolsDb.editInDb as any).mockImplementation(
            async (_table: any, entity: any) => {
                fidmanSyncEnabledAtWrite = entity.fidmanSyncEnabled;
                return {};
            }
        );
        (ToolsDb.addInDb as any).mockImplementation(async (_t: any, d: any) => {
            d.id = 4242;
            return d;
        });
        (Tools.cloneOfObject as any).mockImplementation((o: any) =>
            JSON.parse(JSON.stringify(o))
        );
        (CurrentSprintValidator.checkColumns as any).mockResolvedValue(
            undefined
        );
        (TaskStore.update as any).mockReturnValue(undefined);
        (FidmanSync.enqueueFidmanContractPush as any).mockResolvedValue(555);
        (FidmanSync.tryDeliverAfterCommit as any).mockResolvedValue(undefined);
    });

    /**
     * Typ 3 („Żółty") jest w domyślnej allowliście, więc o wyniku rozstrzyga sam znacznik.
     * Pominięcie klucza, a nie `undefined` na kluczu, odwzorowuje żądanie z ekranu terminów:
     * cienki obiekt, w którym tego pola po prostu nie ma.
     */
    const makeContract = (fidmanSyncEnabled?: boolean) => ({
        id: 4242,
        alias: 'FID-TEST',
        typeId: 3,
        _type: { id: 3, name: 'IK', isOur: true },
        number: '001',
        name: 'Umowa FIDman',
        startDate: '2026-06-01',
        endDate: '2027-05-31',
        status: 'W trakcie',
        _project: { id: 1, ourId: 'PRJ-001', gdFolderId: 'gd-1' },
        projectOurId: 'PRJ-001',
        gdFolderId: 'FOLDER_ABC',
        _employers: [{ id: 7, name: 'PWiK', taxNumber: '7471917575' }],
        _contractors: [],
        _engineers: [],
        _contractRangesPerContract: [],
        ...(fidmanSyncEnabled === undefined ? {} : { fidmanSyncEnabled }),
    });

    const editContract = async (contract: any) => {
        const ContractsController = (await import('../ContractsController'))
            .default;
        await ContractsController.edit(contract);
    };

    it('żądanie BEZ znacznika przy umowie WŁĄCZONEJ w bazie tworzy wiersz w kolejce wysyłkowej', async () => {
        dbFlag = 1;

        await editContract(makeContract(undefined));

        expect(FidmanSync.enqueueFidmanContractPush).toHaveBeenCalledTimes(1);
        expect(FidmanSync.tryDeliverAfterCommit).toHaveBeenCalledWith(555);
    });

    it('KONTROLA NEGATYWNA: to samo żądanie BEZ znacznika przy umowie WYKLUCZONEJ w bazie nie tworzy wiersza w kolejce', async () => {
        dbFlag = 0;

        await editContract(makeContract(undefined));

        expect(FidmanSync.enqueueFidmanContractPush).not.toHaveBeenCalled();
        expect(FidmanSync.tryDeliverAfterCommit).not.toHaveBeenCalled();
    });

    it('żądanie BEZ znacznika przy umowie, której w bazie nie ma, nie tworzy wiersza w kolejce (odczyt bez wiersza zostaje fail-closed)', async () => {
        dbFlag = null;

        await editContract(makeContract(undefined));

        expect(FidmanSync.enqueueFidmanContractPush).not.toHaveBeenCalled();
    });

    it('jawne false w żądaniu nie kolejkuje mimo włączonego znacznika w bazie i w ogóle nie sięga po wartość do bazy', async () => {
        dbFlag = 1;

        await editContract(makeContract(false));

        expect(FidmanSync.enqueueFidmanContractPush).not.toHaveBeenCalled();
        // Warunek dociągania to `=== undefined`, a nie fałszywość: gdyby sprawdzał
        // fałszywość, jawne `false` poszłoby ścieżką odczytu i baza by je nadpisała.
        expect(mockConn.query).not.toHaveBeenCalled();
    });

    it('jawne true w żądaniu kolejkuje bez sięgania po wartość do bazy (trasa formularza działa jak dotąd)', async () => {
        dbFlag = 0;

        await editContract(makeContract(true));

        expect(FidmanSync.enqueueFidmanContractPush).toHaveBeenCalledTimes(1);
        expect(mockConn.query).not.toHaveBeenCalled();
    });

    it('dociągnięta wartość nie trafia do warstwy zapisu ani na obiekt umowy — kolumna FidmanSyncEnabled nie ma jak wejść do UPDATE (pułapka 1)', async () => {
        dbFlag = 1;
        const contract = makeContract(undefined);

        await editContract(contract);

        // Warstwa zapisu widziała pole puste, więc ToolsDb pominął kolumnę.
        expect(fidmanSyncEnabledAtWrite).toBeUndefined();
        // ...a po całej edycji obiekt nadal go nie niesie, więc nie wycieknie też
        // do odpowiedzi HTTP i nie wróci w kolejnym zapisie jako wartość jawna.
        expect((contract as any).fidmanSyncEnabled).toBeUndefined();
        // Kontrola pozytywna dla samego pomiaru: odczyt naprawdę się odbył i
        // naprawdę zwrócił „włączona", więc puste pole wyżej to nie skutek tego,
        // że gałąź dociągania w ogóle się nie wykonała.
        expect(mockConn.query).toHaveBeenCalledTimes(1);
        expect(FidmanSync.enqueueFidmanContractPush).toHaveBeenCalledTimes(1);
    });

    it('odczyt znacznika idzie połączeniem transakcji, a nie osobnym połączeniem z puli', async () => {
        dbFlag = 1;

        await editContract(makeContract(undefined));

        // Drugie połączenie brane w trakcie własnej transakcji to gotowe
        // zakleszczenie na wyczerpanej puli — stąd asercja na obie drogi naraz.
        expect(mockConn.query).toHaveBeenCalledTimes(1);
        expect(ToolsDb.getQueryCallbackAsync).not.toHaveBeenCalled();
    });

    it('znacznik z bazy nie omija allowlisty typów: umowa typu spoza allowlisty nie kolejkuje mimo włączonego znacznika w bazie', async () => {
        dbFlag = 1;

        await editContract({ ...makeContract(undefined), typeId: 5 });

        expect(FidmanSync.enqueueFidmanContractPush).not.toHaveBeenCalled();
    });
});

describe('ContractsController.add() — WYK-2B: ścieżka dodania zostaje bez zmian', () => {
    let mockConn: any;

    beforeEach(() => {
        jest.clearAllMocks();

        const realFidmanSync = jest.requireActual(
            '../fidmanSync/FidmanSync'
        ) as typeof FidmanSync;
        (FidmanSync.isFidmanSyncEligible as any).mockImplementation(
            realFidmanSync.isFidmanSyncEligible
        );
        (FidmanSync.readContractFidmanSyncEnabled as any).mockImplementation(
            realFidmanSync.readContractFidmanSyncEnabled
        );

        mockConn = {
            beginTransaction: jest.fn(),
            commit: jest.fn(),
            rollback: jest.fn(),
            release: jest.fn(),
            // Gdyby ścieżka dodania kiedykolwiek zaczęła dociągać znacznik, wróciłoby
            // „włączona" — i test niżej by to zobaczył jako wiersz w kolejce.
            query: jest.fn(async () => [[{ FidmanSyncEnabled: 1 }], undefined]),
        };

        (ToolsDb.getQueryCallbackAsync as any).mockResolvedValue([]);
        (ToolsDb.transaction as jest.Mock).mockImplementation(
            async (callback: any) => callback(mockConn)
        );
        (ToolsDb.addInDb as any).mockImplementation(async (_t: any, d: any) => {
            d.id = 4242;
            return d;
        });
        (Tools.cloneOfObject as any).mockImplementation((o: any) =>
            JSON.parse(JSON.stringify(o))
        );
        (CurrentSprintValidator.checkColumns as any).mockResolvedValue(
            undefined
        );
        (TaskStore.update as any).mockReturnValue(undefined);
        (FidmanSync.enqueueFidmanContractPush as any).mockResolvedValue(555);
        (FidmanSync.tryDeliverAfterCommit as any).mockResolvedValue(undefined);
    });

    const makeNewContract = () => ({
        alias: 'FID-TEST',
        typeId: 3,
        _type: { id: 3, name: 'IK', isOur: true },
        number: '001',
        name: 'Umowa FIDman',
        startDate: '2026-06-01',
        endDate: '2027-05-31',
        status: 'W trakcie',
        _project: { id: 1, ourId: 'PRJ-001', gdFolderId: 'gd-1' },
        projectOurId: 'PRJ-001',
        gdFolderId: 'FOLDER_ABC',
        _employers: [{ id: 7, name: 'PWiK', taxNumber: '7471917575' }],
        _contractors: [],
        _engineers: [],
        _contractRangesPerContract: [],
        id: undefined as any,
        isUniquePerProject: jest.fn(() => Promise.resolve(false)) as any,
    });

    it('dodanie nowej umowy bez znacznika nie tworzy wiersza w kolejce i nie sięga po wartość do bazy — nowa umowa rodzi się wykluczona', async () => {
        const ContractsController = (await import('../ContractsController'))
            .default;

        await ContractsController.add(makeNewContract() as any);

        expect(FidmanSync.enqueueFidmanContractPush).not.toHaveBeenCalled();
        expect(FidmanSync.tryDeliverAfterCommit).not.toHaveBeenCalled();
        // O wartości ma rozstrzygać DEFAULT 0 kolumny, a nie odczyt — nowa umowa
        // nie ma jeszcze czego czytać, więc cisza dalej znaczy „wykluczona".
        expect(mockConn.query).not.toHaveBeenCalled();
        expect(
            FidmanSync.readContractFidmanSyncEnabled
        ).not.toHaveBeenCalled();
    });
});
