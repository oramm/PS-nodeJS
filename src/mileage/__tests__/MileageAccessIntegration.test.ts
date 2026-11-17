jest.mock('../../index', () => ({ app: { get: jest.fn(), post: jest.fn() } }));
jest.mock('../MileageController', () => ({
    __esModule: true,
    default: { getVehicles: jest.fn(), addTripFromDto: jest.fn(), getDrivers: jest.fn() },
}));
jest.mock('../../staff/StaffMemberRepository', () => ({
    __esModule: true, default: { isDriver: jest.fn() },
}));
jest.mock('../../persons/projectAssignments/ProjectScopeGuard', () => ({
    ForbiddenError: class ForbiddenError extends Error {},
}));
import { app } from '../../index';
import MileageController from '../MileageController';
import StaffMemberRepository from '../../staff/StaffMemberRepository';
import { ForbiddenError } from '../../persons/projectAssignments/ProjectScopeGuard';
import { SystemRoleName } from '../../types/sessionTypes';

let vehicles: any;
let trip: any;
beforeAll(() => {
    require('../MileageRouters');
    vehicles = (app.get as jest.Mock).mock.calls.find(c => c[0] === '/mileage/vehicles')![1];
    trip = (app.post as jest.Mock).mock.calls.find(c => c[0] === '/mileage/trip')![1];
});

it.each([SystemRoleName.ENVI_COOPERATOR, SystemRoleName.ENVI_EMPLOYEE])(
    '%s retains dated mileage access without a StaffMembers driver record', async role => {
        (MileageController.getVehicles as jest.Mock).mockResolvedValue([]);
        const req = { session: { userData: { enviId: 7, systemRoleName: role } }, query: { date: '2027-01-01' } };
        const res = { send: jest.fn() };
        const next = jest.fn();
        await vehicles(req, res, next);
        expect(StaffMemberRepository.isDriver).not.toHaveBeenCalled();
        expect(MileageController.getVehicles).toHaveBeenCalledWith('2027-01-01');
        expect(next).not.toHaveBeenCalled();
        expect(res.send).toHaveBeenCalledWith([]);
    },
);

it.each([SystemRoleName.CONTRACT_WORKER, SystemRoleName.CLIENT])(
    '%s without driver permission cannot read or submit a dated trip', async role => {
        (StaffMemberRepository.isDriver as jest.Mock).mockResolvedValue(false);
        const req = { session: { userData: { enviId: 7, systemRoleName: role, userName: 'TEST' } }, query: { date: '2027-01-01' }, parsedBody: { date: '2027-01-01' } };
        const res = { send: jest.fn() };
        const next = jest.fn();
        await vehicles(req, res, next);
        await trip(req, res, next);
        expect(next).toHaveBeenCalledTimes(2);
        expect(next.mock.calls.every(call => call[0] instanceof ForbiddenError)).toBe(true);
        expect(MileageController.getVehicles).not.toHaveBeenCalled();
        expect(MileageController.addTripFromDto).not.toHaveBeenCalled();
        expect(res.send).not.toHaveBeenCalled();
    },
);

it.each([SystemRoleName.CONTRACT_WORKER, SystemRoleName.CLIENT])(
    '%s with driver permission passes the unchanged dated request to the controller', async role => {
        (StaffMemberRepository.isDriver as jest.Mock).mockResolvedValue(true);
        const dto = { date: '2026-12-31', requestId: 'test-retry-2026', vehicleId: '1' };
        const saved = { lp: 1, year: 2026 };
        (MileageController.addTripFromDto as jest.Mock).mockResolvedValue(saved);
        const req = { session: { userData: { enviId: 7, systemRoleName: role, userName: 'TEST' } }, parsedBody: dto };
        const res = { send: jest.fn() };
        const next = jest.fn();
        await trip(req, res, next);
        expect(StaffMemberRepository.isDriver).toHaveBeenCalledWith(7);
        expect(MileageController.addTripFromDto).toHaveBeenCalledWith(dto, 'TEST');
        expect(res.send).toHaveBeenCalledWith(saved);
        expect(next).not.toHaveBeenCalled();
    },
);
