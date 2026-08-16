/**
 * GLO-P1 (D-GLO-4) — zapis flagi „użytkownik FIDmana" przy koncie osoby.
 *
 * Zakres:
 *  (a) warunki kolejkowania: 0->1, 1->1, 1->0, 0->0, brak pola w payloadzie
 *  (b) walidacja „flaga 1 wymaga SystemEmail" odrzuca zapis (400), a nie wysyła payload na 400
 *  (c) wiersz outboxu powstaje w TEJ SAMEJ transakcji, dostawa dopiero po commicie
 *  (d) osoba bez wiersza w PersonAccounts (1 ze 179 wg GLO-R0) — zapis flagi zakłada wiersz
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import ToolsDb from '../../tools/ToolsDb';
import PersonRepository from '../PersonRepository';
import {
    enqueueFidmanUserPush,
    tryDeliverAfterCommit,
} from '../../contracts/fidmanSync/FidmanSync';

jest.mock('../../tools/ToolsDb');
jest.mock('../../contracts/fidmanSync/FidmanSync', () => {
    const actual = jest.requireActual(
        '../../contracts/fidmanSync/FidmanSync'
    ) as any;
    return {
        ...actual,
        enqueueFidmanUserPush: jest.fn(),
        tryDeliverAfterCommit: jest.fn(),
    };
});

const enqueueMock = enqueueFidmanUserPush as unknown as jest.Mock<
    (...args: any[]) => Promise<number>
>;
const deliverMock = tryDeliverAfterCommit as unknown as jest.Mock<
    (...args: any[]) => Promise<void>
>;

const PERSON_ID = 4242;

const fullSource = {
    personId: PERSON_ID,
    entityId: 1,
    name: 'Anna',
    surname: 'Kowalska',
    systemEmail: 'anna.kowalska@envi.com.pl',
    cellphone: '600100200',
};

describe('PersonsController.upsertPersonAccountV2 — flaga FIDmana', () => {
    const mockConn = { threadId: 4242 } as any;
    let upsertSpy: jest.SpiedFunction<
        typeof PersonRepository.prototype.upsertPersonAccountInDb
    >;

    /**
     * @param previousFlag stan flagi w PersonAccounts sprzed zapisu; undefined = brak wiersza
     */
    async function setUp(options: {
        previousFlag?: boolean;
        source?: typeof fullSource | undefined;
    }) {
        jest.clearAllMocks();
        (ToolsDb.transaction as jest.Mock).mockImplementation(
            async (...args: any[]) => {
                const callback = args[0] as (conn: any) => Promise<any>;
                return await callback(mockConn);
            }
        );
        enqueueMock.mockResolvedValue(9001);
        deliverMock.mockResolvedValue(undefined);

        const previousAccount =
            options.previousFlag === undefined
                ? undefined
                : {
                      personId: PERSON_ID,
                      systemEmail: fullSource.systemEmail,
                      fidmanEnabled: options.previousFlag,
                  };

        jest.spyOn(PersonRepository.prototype, 'getPersonAccountV2')
            // pierwsze wywołanie: stan sprzed zapisu; kolejne: wynik zwracany do klienta
            .mockResolvedValueOnce(previousAccount as any)
            .mockResolvedValue({ personId: PERSON_ID } as any);
        jest.spyOn(
            PersonRepository.prototype,
            'getFidmanUserSourceInConn'
        ).mockResolvedValue(
            (options.source === undefined ? fullSource : options.source) as any
        );
        upsertSpy = jest
            .spyOn(PersonRepository.prototype, 'upsertPersonAccountInDb')
            .mockResolvedValue(undefined);

        const { default: PersonsController } = await import(
            '../PersonsController'
        );
        (PersonsController as any).instance = undefined;
        return PersonsController;
    }

    it('zaznaczenie (0 -> 1) kolejkuje push z enabled:true w tej samej transakcji', async () => {
        const PersonsController = await setUp({ previousFlag: false });

        await PersonsController.upsertPersonAccountV2({
            personId: PERSON_ID,
            fidmanEnabled: true,
        });

        expect(enqueueMock).toHaveBeenCalledTimes(1);
        expect(enqueueMock).toHaveBeenCalledWith(
            expect.objectContaining({ personId: PERSON_ID }),
            true,
            mockConn
        );
        // Dostawa jest post-commit: kolejkowanie dostaje połączenie transakcji, dostawa nie.
        expect(deliverMock).toHaveBeenCalledWith(9001);
    });

    it('zapis konta przy zapalonej fladze (1 -> 1) dowozi zmiany do FIDmana', async () => {
        const PersonsController = await setUp({ previousFlag: true });

        await PersonsController.upsertPersonAccountV2({
            personId: PERSON_ID,
            systemEmail: 'nowy.adres@envi.com.pl',
        });

        expect(enqueueMock).toHaveBeenCalledWith(
            expect.anything(),
            true,
            mockConn
        );
    });

    it('odznaczenie (1 -> 0) wysyła enabled:false, a nie kasowanie', async () => {
        const PersonsController = await setUp({ previousFlag: true });

        await PersonsController.upsertPersonAccountV2({
            personId: PERSON_ID,
            fidmanEnabled: false,
        });

        expect(enqueueMock).toHaveBeenCalledTimes(1);
        expect(enqueueMock).toHaveBeenCalledWith(
            expect.anything(),
            false,
            mockConn
        );
    });

    it('flaga 0 bez wcześniejszej 1 (0 -> 0) NIE wysyła nic', async () => {
        const PersonsController = await setUp({ previousFlag: false });

        await PersonsController.upsertPersonAccountV2({
            personId: PERSON_ID,
            fidmanEnabled: false,
            systemEmail: 'anna.kowalska@envi.com.pl',
        });

        expect(enqueueMock).not.toHaveBeenCalled();
        expect(deliverMock).not.toHaveBeenCalled();
    });

    it('osoba bez wiersza w PersonAccounts zaczyna od 0 — sam zapis roli nic nie wysyła', async () => {
        // GLO-R0: 1 ze 179 osób z SystemEmail nie ma dziś wiersza konta.
        const PersonsController = await setUp({ previousFlag: undefined });

        await PersonsController.upsertPersonAccountV2({
            personId: PERSON_ID,
            systemRoleId: 2,
        });

        expect(enqueueMock).not.toHaveBeenCalled();
        // ...ale zapis nadal idzie upsertem, więc wiersz konta powstanie.
        expect(upsertSpy).toHaveBeenCalledWith(
            expect.objectContaining({ id: PERSON_ID }),
            mockConn,
            expect.arrayContaining(['systemRoleId'])
        );
    });

    it('osoba bez wiersza konta, zaznaczona od razu — wiersz powstaje i push leci', async () => {
        const PersonsController = await setUp({ previousFlag: undefined });

        await PersonsController.upsertPersonAccountV2({
            personId: PERSON_ID,
            systemEmail: fullSource.systemEmail,
            fidmanEnabled: true,
        });

        expect(upsertSpy).toHaveBeenCalledWith(
            expect.objectContaining({ id: PERSON_ID, fidmanEnabled: true }),
            mockConn,
            expect.arrayContaining(['fidmanEnabled'])
        );
        expect(enqueueMock).toHaveBeenCalledWith(expect.anything(), true, mockConn);
    });

    it('payload bez pola flagi nie znaczy „wyłącz" — przy zapalonej fladze push nadal enabled:true', async () => {
        const PersonsController = await setUp({ previousFlag: true });

        await PersonsController.upsertPersonAccountV2({
            personId: PERSON_ID,
            systemRoleId: 3,
        });

        expect(enqueueMock).toHaveBeenCalledWith(
            expect.anything(),
            true,
            mockConn
        );
    });

    it('flaga 1 bez e-maila systemowego odrzuca zapis komunikatem po polsku, zamiast wysyłać payload na 400', async () => {
        const PersonsController = await setUp({
            previousFlag: false,
            source: { ...fullSource, systemEmail: null } as any,
        });

        await expect(
            PersonsController.upsertPersonAccountV2({
                personId: PERSON_ID,
                fidmanEnabled: true,
            })
        ).rejects.toThrow('Użytkownik FIDmana musi mieć e-mail systemowy.');

        expect(enqueueMock).not.toHaveBeenCalled();
        expect(deliverMock).not.toHaveBeenCalled();
    });

    it('odmowa niesie status 400 — to błąd danych użytkownika, nie awaria serwera', async () => {
        const PersonsController = await setUp({
            previousFlag: false,
            source: { ...fullSource, systemEmail: null } as any,
        });

        await expect(
            PersonsController.upsertPersonAccountV2({
                personId: PERSON_ID,
                fidmanEnabled: true,
            })
        ).rejects.toMatchObject({ status: 400 });
    });

    it('za długie nazwisko odrzuca zapis w PS — FIDman ma na nie 32 znaki', async () => {
        const PersonsController = await setUp({
            previousFlag: false,
            source: { ...fullSource, surname: 'x'.repeat(33) } as any,
        });

        await expect(
            PersonsController.upsertPersonAccountV2({
                personId: PERSON_ID,
                fidmanEnabled: true,
            })
        ).rejects.toThrow('maksymalnie 32');
    });

    it('braku danych nie da się użyć do zablokowania ODZNACZENIA', async () => {
        // Inaczej powstałaby pułapka: żeby wyłączyć konto, trzeba by najpierw poprawić dane,
        // które przestały być potrzebne.
        const PersonsController = await setUp({
            previousFlag: true,
            source: { ...fullSource, systemEmail: null } as any,
        });

        await expect(
            PersonsController.upsertPersonAccountV2({
                personId: PERSON_ID,
                fidmanEnabled: false,
            })
        ).resolves.toBeDefined();
    });
});
