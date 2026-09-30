import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import ToolsDb from '../../tools/ToolsDb';
import SbAccessRepository from '../SbAccessRepository';
import SbAccessEventRepository from '../SbAccessEventRepository';
import SbAccessController from '../SbAccessController';
import { SbAccessTransitionInput } from '../sbAccessTypes';

describe('SbAccessController', () => {
    let pending: string[];
    let saved: string[];
    let conn: any;
    let state: ReturnType<typeof jest.spyOn>;
    let event: ReturnType<typeof jest.spyOn>;
    let transaction: ReturnType<typeof jest.spyOn>;
    const input: SbAccessTransitionInput = {
        personId: 17,
        actionCode: 'ACTIVATE',
        resultCode: 'OK',
        requestedByPersonId: 18,
        note: 'Przyjęto zaproszenie',
        state: { statusCode: 'ACTIVE', githubLogin: 'login' },
    };

    beforeEach(() => {
        pending = [];
        saved = [];
        conn = {
            beginTransaction: jest.fn(async () => {
                pending = [];
            }),
            commit: jest.fn(async () => {
                saved.push(...pending);
                pending = [];
            }),
            rollback: jest.fn(async () => {
                pending = [];
            }),
            release: jest.fn(),
        };
        // Prawdziwa transakcja ToolsDb; getter puli zwraca wyłącznie atrapę, bez I/O.
        jest.spyOn(ToolsDb, 'pool', 'get').mockReturnValue({
            getConnection: jest.fn(async () => conn),
        } as any);
        transaction = jest.spyOn(ToolsDb, 'transaction');
        state = jest
            .spyOn(SbAccessRepository.prototype, 'upsertState')
            .mockImplementation(async () => {
                pending.push('stan');
            });
        event = jest
            .spyOn(SbAccessEventRepository.prototype, 'append')
            .mockImplementation(async () => {
                pending.push('zdarzenie');
            });
    });

    it('stan i zdarzenie zatwierdza razem w jednej transakcji na tym samym conn', async () => {
        await SbAccessController.recordTransition(input);
        expect(transaction).toHaveBeenCalledTimes(1);
        expect(state).toHaveBeenCalledWith(conn, {
            personId: 17,
            ...input.state,
        });
        expect(event).toHaveBeenCalledWith(conn, {
            personId: 17,
            actionCode: 'ACTIVATE',
            resultCode: 'OK',
            requestedByPersonId: 18,
            note: input.note,
        });
        expect(saved).toEqual(['stan', 'zdarzenie']);
        expect(conn.beginTransaction).toHaveBeenCalledTimes(1);
        expect(conn.commit).toHaveBeenCalledTimes(1);
        expect(conn.rollback).not.toHaveBeenCalled();
        expect(conn.release).toHaveBeenCalledTimes(1);
    });

    it('błąd zdarzenia propaguje wyjątek i wycofuje wcześniejszy zapis stanu', async () => {
        const error = new Error('Błąd zdarzenia');
        event.mockImplementation(async () => {
            pending.push('zdarzenie');
            throw error;
        });
        await expect(SbAccessController.recordTransition(input)).rejects.toBe(
            error,
        );
        expect(state).toHaveBeenCalledTimes(1);
        expect(conn.rollback).toHaveBeenCalledTimes(1);
        expect(conn.commit).not.toHaveBeenCalled();
        expect(pending).toEqual([]);
        expect(saved).toEqual([]);
        expect(conn.release).toHaveBeenCalledTimes(1);
    });

    it('błąd stanu przerywa operację przed zdarzeniem i wycofuje transakcję', async () => {
        state.mockRejectedValue(new Error('Błąd stanu'));
        await expect(
            SbAccessController.recordTransition(input),
        ).rejects.toThrow('Błąd stanu');
        expect(event).not.toHaveBeenCalled();
        expect(conn.rollback).toHaveBeenCalledTimes(1);
        expect(saved).toEqual([]);
    });

    it.each(['FAILED', 'PARTIAL'] as const)(
        'wynik %s bez stanu zapisuje tylko zdarzenie',
        async (resultCode) => {
            await SbAccessController.recordTransition({
                ...input,
                state: undefined,
                resultCode,
            });
            expect(state).not.toHaveBeenCalled();
            expect(saved).toEqual(['zdarzenie']);
            expect(transaction).toHaveBeenCalledTimes(1);
        },
    );

    it.each([
        { actionCode: 'UNKNOWN' },
        { resultCode: 'UNKNOWN' },
        { state: { statusCode: 'UNKNOWN' } },
        { personId: undefined },
        { personId: 0 },
        { personId: -1 },
        { personId: 1.5 },
        { requestedByPersonId: 0 },
    ])('niepoprawne wejście %p odrzuca przed transakcją', async (invalid) => {
        await expect(
            SbAccessController.recordTransition({
                ...input,
                ...invalid,
            } as any),
        ).rejects.toThrow();
        expect(transaction).not.toHaveBeenCalled();
        expect(state).not.toHaveBeenCalled();
        expect(event).not.toHaveBeenCalled();
    });

    it('cienkie metody odczytu przekazują parametry do repozytoriów', async () => {
        const list = jest
            .spyOn(SbAccessRepository.prototype, 'list')
            .mockResolvedValue([]);
        const get = jest
            .spyOn(SbAccessRepository.prototype, 'getByPersonId')
            .mockResolvedValue(null);
        const history = jest
            .spyOn(SbAccessEventRepository.prototype, 'listByPersonId')
            .mockResolvedValue([]);
        expect(await SbAccessController.list()).toEqual([]);
        expect(await SbAccessController.getByPersonId(17)).toBeNull();
        expect(await SbAccessController.history(17, 10)).toEqual([]);
        expect(list).toHaveBeenCalledTimes(1);
        expect(get).toHaveBeenCalledWith(17);
        expect(history).toHaveBeenCalledWith(17, 10);
    });
});
