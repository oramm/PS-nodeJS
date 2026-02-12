import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import PersonRepository from '../PersonRepository';

describe('PersonRepository P2-D idempotency hardening', () => {
    let repository: PersonRepository;
    let mockConn: any;

    beforeEach(() => {
        repository = new PersonRepository();
        mockConn = {
            query: jest.fn(),
            execute: jest.fn(),
        };
    });

    it('returns controlled error and prevents write when SystemEmail is already used by another person', async () => {
        mockConn.query.mockResolvedValueOnce([[{ PersonId: 9002 }]]);

        await expect(
            repository.upsertPersonAccountInDb(
                {
                    id: 9001,
                    systemEmail: 'duplicate.persons-v2@test.local',
                },
                mockConn as any,
                ['systemEmail'],
            ),
        ).rejects.toMatchObject({
            name: 'DbError',
            code: 'PERSON_ACCOUNT_SYSTEM_EMAIL_CONFLICT',
        });

        expect(mockConn.query).toHaveBeenCalledWith(
            expect.stringContaining('WHERE SystemEmail = ?'),
            ['duplicate.persons-v2@test.local', 9001],
        );
        expect(mockConn.execute).not.toHaveBeenCalled();
    });

    it('maps ER_DUP_ENTRY race condition to controlled SystemEmail conflict error', async () => {
        mockConn.query
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[]]);
        mockConn.execute.mockRejectedValueOnce({ code: 'ER_DUP_ENTRY' });

        await expect(
            repository.upsertPersonAccountInDb(
                {
                    id: 9003,
                    systemEmail: 'race.persons-v2@test.local',
                },
                mockConn as any,
                ['systemEmail'],
            ),
        ).rejects.toMatchObject({
            name: 'DbError',
            code: 'PERSON_ACCOUNT_SYSTEM_EMAIL_CONFLICT',
        });
    });

    it('updates account row only by current PersonId when SystemEmail is available', async () => {
        mockConn.query
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[{ Id: 11 }]]);
        mockConn.execute.mockResolvedValueOnce([{}]);

        await repository.upsertPersonAccountInDb(
            {
                id: 9004,
                systemEmail: 'safe-update.persons-v2@test.local',
            },
            mockConn as any,
            ['systemEmail'],
        );

        expect(mockConn.execute).toHaveBeenCalledWith(
            expect.stringContaining('WHERE PersonId = ?'),
            ['safe-update.persons-v2@test.local', 9004],
        );
    });
});
