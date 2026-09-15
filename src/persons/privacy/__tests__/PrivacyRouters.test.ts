import PrivacyController from '../PrivacyController';
import PublicController from '../../publicProfileSubmission/PublicProfileSubmissionController';
import PrivacyValidator from '../PrivacyValidator';
import { currentNotice } from '../PrivacyNotice';
import { app } from '../../../index';
jest.mock('../../../index', () => ({ app: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() }, upload: { single: jest.fn(() => jest.fn()) } }));
jest.mock('../PrivacyController');
jest.mock('../../publicProfileSubmission/PublicProfileSubmissionController');
require('../PrivacyRouters');
require('../../publicProfileSubmission/PublicProfileSubmissionRouters');
const routes = (app.post as jest.Mock).mock.calls.slice();
describe('privacy route body boundary', () => {
    it.each([
        ['/v2/privacy/system/acknowledgements', 'SYSTEM'],
        ['/v2/public/experience-update/:token/privacy/acknowledgements', 'PUBLIC_PROFILE'],
    ] as const)('preserves JSON version identifiers on %s', async (path, scope) => {
        const notice = currentNotice(scope);
        const body = {version: notice.version, revision: notice.revision, acknowledged: true};
        const save = jest.fn(async (...args: any[]) => {
            const dto = args[2];
            PrivacyValidator.acknowledgement(dto, notice);
            return {acknowledged: true};
        });
        (PrivacyController.acknowledge as jest.Mock).mockImplementation(save);
        (PublicController.acknowledgePrivacy as jest.Mock).mockImplementation(save);
        const handler = routes.find(call => call[0] === path)![1];
        const req: any = {body, parsedBody: {...body, revision: 1}, session: {userData: {enviId: 7}}, params: {token: 'link'}, headers: {authorization: 'Bearer verified'}};
        const res: any = {send: jest.fn(), status: jest.fn().mockReturnThis()};
        const next = jest.fn();
        await handler(req, res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
        expect(res.send).toHaveBeenCalledWith({acknowledged: true});
        expect(save.mock.calls[0][2]).toBe(body);
    });
});