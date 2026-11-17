jest.mock('googleapis', () => ({ google: { sheets: jest.fn() } }));
jest.mock('../../tools/Tools', () => ({ __esModule: true, default: {} }));
jest.mock('../../setup/Sessions/ToolsGapi', () => ({ oAuthClient: { setCredentials: jest.fn(), getAccessToken: jest.fn() } }));
jest.mock('../CarRepository', () => ({ __esModule: true, default: { getMileageCars: jest.fn() } }));
jest.mock('../../staff/StaffMemberRepository', () => ({ __esModule: true, default: {} }));
jest.mock('../../persons/PersonsController', () => ({ __esModule: true, default: {} }));
jest.mock('../../persons/projectAssignments/ProjectScopeGuard', () => ({ ForbiddenError: class extends Error {} }));
jest.mock('../../index', () => ({ app: { get: jest.fn(), post: jest.fn() } }));
import { google } from 'googleapis';
import { app } from '../../index';
import CarRepository from '../CarRepository';
import ToolsSheets from '../../tools/ToolsSheets';
import MileageController from '../MileageController';

const dto = { vehicleId: '1', date: '2027-01-01', projectOurId: '', purpose: 'tankowanie', routeParts: ['Brzeg'], startReading: 100, endReading: 110 };
const update = jest.fn();
const batchUpdate = jest.fn();
const originalRefreshToken = process.env.REFRESH_TOKEN;
let route: any;
beforeAll(() => {
    require('../MileageRouters');
    route = (app.post as jest.Mock).mock.calls.find(c => c[0] === '/mileage/trip')![1];
});
beforeEach(() => {
    process.env.REFRESH_TOKEN = 'synthetic-test-token';
    (CarRepository.getMileageCars as jest.Mock).mockResolvedValue([{ id: 1, spreadsheetId: 'fake', gid: 1, plate: 'TEST' }]);
    (google.sheets as jest.Mock).mockReturnValue({ spreadsheets: {
        get: jest.fn().mockResolvedValue({ data: { sheets: [{ properties: { sheetId: 1, title: 'TEST' } }] } }),
        values: { get: jest.fn().mockResolvedValue({ data: { values: [['header']] } }), update }, batchUpdate,
    } });
    update.mockReset(); batchUpdate.mockReset();
});
afterAll(() => {
    if (originalRefreshToken === undefined) delete process.env.REFRESH_TOKEN;
    else process.env.REFRESH_TOKEN = originalRefreshToken;
});
it('strict writer rejects but the legacy API retains its existing behavior', async () => {
    const failure = new Error('rejected'); update.mockRejectedValue(failure);
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const params = { spreadsheetId: 'fake', rangeA1: 'TEST!A2', values: [[1]] };
    await expect(ToolsSheets.updateValuesStrict({} as any, params)).rejects.toBe(failure);
    await expect(ToolsSheets.updateValues({} as any, params)).resolves.toBeUndefined();
    spy.mockRestore();
});
