jest.mock('../../../../setup/Sessions/ToolsGapi', () => ({ oAuthClient: {} }));
jest.mock('../../../../tools/ToolsDb', () => ({
    __esModule: true,
    default: { transaction: jest.fn() },
}));

import Validator from '../MilestoneContractLinkValidator';
import Repository from '../MilestoneContractLinkRepository';
import Controller from '../MilestoneContractLinksController';
import Link from '../MilestoneContractLink';
import ToolsDb from '../../../../tools/ToolsDb';

const dto = { milestoneId: 1, contractId: 2 };
const milestone = { id: 1, contractId: 1, offerId: null };
const contracts = [{ id: 1, projectOurId: 'A' }, { id: 2, projectOurId: 'A' }];

describe('additional milestone link persistence boundary', () => {
    it.each([0, -1, 0.5, NaN, Infinity, 2147483648, '1', null, undefined])(
        'rejects non-INT identifier %p before accessing the database',
        async (id) => {
            await expect(Controller.addFromDto({ ...dto, milestoneId: id as number }))
                .rejects.toThrow('INVALID_REQUEST');
            expect(ToolsDb.transaction).not.toHaveBeenCalled();
        }
    );

    it('accepts a pair and derives source from locked server data', () => {
        expect(() => Validator.validateDto(dto)).not.toThrow();
        expect(() => Validator.validateParents(dto, milestone, contracts)).not.toThrow();
    });

    it.each([
        [undefined, contracts, 'OBJECT_NOT_FOUND'],
        [{ ...milestone, contractId: null }, contracts, 'TYPE_MISMATCH'],
        [{ ...milestone, offerId: 7 }, contracts, 'TYPE_MISMATCH'],
        [{ ...milestone, contractId: 2 }, contracts, 'SELF_LINK'],
        [milestone, contracts.slice(0, 1), 'OBJECT_NOT_FOUND'],
        [milestone, contracts.slice(1), 'OBJECT_NOT_FOUND'],
        [milestone, [contracts[0], { id: 2, projectOurId: 'B' }], 'CROSS_PROJECT'],
    ])('rejects invalid locked parents (%p)', (parent, parents, code) => {
        expect(() => Validator.validateParents(dto, parent as typeof milestone, parents as typeof contracts))
            .toThrow(code as string);
    });

    it('repository refuses implicit write transactions and identity edits', async () => {
        const repository = new Repository();
        await expect(repository.addInDb(new Link(dto))).rejects.toThrow('Caller-owned transaction required');
        await expect(repository.deleteFromDb(new Link(dto))).rejects.toThrow('Caller-owned transaction required');
        await expect(repository.editInDb()).rejects.toThrow('identity is immutable');
    });
});