import ContractMeetingNoteValidator from '../ContractMeetingNoteValidator';

describe('ContractMeetingNoteValidator', () => {
    describe('validateFindPayload', () => {
        it('returns empty orConditions for missing payload', () => {
            expect(
                ContractMeetingNoteValidator.validateFindPayload(
                    undefined as any,
                ),
            ).toEqual({
                orConditions: [],
            });
        });

        it('returns empty orConditions when payload.orConditions is not an array', () => {
            const result = ContractMeetingNoteValidator.validateFindPayload({
                orConditions: {} as any,
            });
            expect(result).toEqual({ orConditions: [] });
        });
    });

    describe('validateCreatePayload', () => {
        it('throws on invalid contractId edge case', () => {
            expect(() =>
                ContractMeetingNoteValidator.validateCreatePayload({
                    contractId: 0,
                    title: 'Note',
                }),
            ).toThrow('contractId must be a positive integer');
        });

        it('normalizes title and nullable optional fields', () => {
            const result = ContractMeetingNoteValidator.validateCreatePayload({
                contractId: 11,
                title: '  Kick-off  ',
                description: '   ',
            });

            expect(result).toMatchObject({
                contractId: 11,
                title: 'Kick-off',
                description: null,
                meetingDate: null,
                protocolGdId: null,
                createdByPersonId: null,
            });
        });

        it('throws when title exceeds max length', () => {
            const tooLongTitle = 'a'.repeat(256);

            expect(() =>
                ContractMeetingNoteValidator.validateCreatePayload({
                    contractId: 1,
                    title: tooLongTitle,
                }),
            ).toThrow('title is too long (max 255 chars)');
        });
    });
});
