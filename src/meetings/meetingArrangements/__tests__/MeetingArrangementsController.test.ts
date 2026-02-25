import MeetingArrangementsController from '../MeetingArrangementsController';
import MeetingArrangementRepository from '../MeetingArrangementRepository';
import MeetingArrangement from '../MeetingArrangement';
import ToolsDb from '../../../tools/ToolsDb';

describe('MeetingArrangementsController', () => {
    beforeEach(() => {
        jest.restoreAllMocks();
        (MeetingArrangementsController as any)._instance = undefined;

        jest.spyOn(ToolsDb, 'getQueryCallbackAsync').mockResolvedValue(
            [] as any,
        );
    });

    describe('updateStatus', () => {
        function mockFindWithStatus(status: string) {
            jest.spyOn(
                MeetingArrangementRepository.prototype,
                'find',
            ).mockResolvedValue([
                new MeetingArrangement({
                    id: 1,
                    name: 'Test arrangement',
                    status: status as any,
                    _parent: { id: 10 },
                    _case: { id: 20 },
                }),
            ]);
        }

        it('PLANNED -> DISCUSSED should succeed', async () => {
            mockFindWithStatus('PLANNED');
            const editSpy = jest
                .spyOn(MeetingArrangementRepository.prototype, 'editInDb')
                .mockResolvedValue(undefined as any);

            const result = await MeetingArrangementsController.updateStatus(
                1,
                'DISCUSSED',
            );

            expect(result.status).toBe('DISCUSSED');
            expect(editSpy).toHaveBeenCalledWith(
                expect.objectContaining({ status: 'DISCUSSED' }),
                undefined,
                false,
                ['status'],
            );
        });

        it('DISCUSSED -> CLOSED should succeed', async () => {
            mockFindWithStatus('DISCUSSED');
            jest.spyOn(
                MeetingArrangementRepository.prototype,
                'editInDb',
            ).mockResolvedValue(undefined as any);

            const result = await MeetingArrangementsController.updateStatus(
                1,
                'CLOSED',
            );

            expect(result.status).toBe('CLOSED');
        });

        it('DISCUSSED -> PLANNED should fail (backward transition)', async () => {
            mockFindWithStatus('DISCUSSED');

            await expect(
                MeetingArrangementsController.updateStatus(1, 'PLANNED'),
            ).rejects.toThrow(
                'Cannot transition from DISCUSSED to PLANNED',
            );
        });

        it('CLOSED -> DISCUSSED should fail (backward transition)', async () => {
            mockFindWithStatus('CLOSED');

            await expect(
                MeetingArrangementsController.updateStatus(1, 'DISCUSSED'),
            ).rejects.toThrow(
                'Cannot transition from CLOSED to DISCUSSED',
            );
        });
    });
});
