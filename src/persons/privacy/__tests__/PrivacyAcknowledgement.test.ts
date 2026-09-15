import PrivacyController from '../PrivacyController';
import PrivacyRepository from '../PrivacyRepository';
import { currentNotice } from '../PrivacyNotice';
import { PUBLIC_PROFILE_PRIVACY_NOTICE, PRIVACY_ADMINISTRATOR_SECTION, PRIVACY_CONTACT_SECTION } from '../../publicProfileSubmission/publicProfileSubmissionPrivacyNotice';
import ToolsDb from '../../../tools/ToolsDb';
import gate from '../../../setup/Sessions/requirePrivacyAcknowledgement';
import PublicController from '../../publicProfileSubmission/PublicProfileSubmissionController';
import PublicRepository from '../../publicProfileSubmission/PublicProfileSubmissionRepository';
jest.mock('../../../tools/ToolsDb');
describe('Privacy acknowledgement', () => {
    afterEach(() => jest.restoreAllMocks());
    it.each(['SYSTEM', 'PUBLIC_PROFILE'] as const)('keeps saved version acknowledgements valid after metadata cleanup in %s', async (scope) => {
        const find = jest.spyOn(PrivacyRepository.prototype, 'find').mockImplementation(async (_id, _scope, version) =>
            version === '2026-09-14' ? '2026-09-14T12:00:00.000Z' : null);
        const status = await PrivacyController.status(7, scope);
        expect(status.acknowledged).toBe(true);
        expect(status.notice.revision).toBe(scope === 'SYSTEM' ? '3' : '2'); // Revision 1 snapshots contain removed metadata and must remain untouched.
        expect(status.notice).not.toHaveProperty('requiresReleaseReview');
        expect(find).toHaveBeenCalledWith(7, scope, '2026-09-14');
        await expect(PrivacyController.acknowledge(7, scope, {...status.notice, revision: '1', acknowledged: true}))
            .rejects.toMatchObject({httpStatus: 409});
    });
    it('shares administrator and contact without depending on public section order', () => {
        const sections = PUBLIC_PROFILE_PRIVACY_NOTICE.sections;
        const original = [...sections];
        try {
            sections.reverse();
            const system = currentNotice('SYSTEM');
            expect(system.sections[0]).toBe(PRIVACY_ADMINISTRATOR_SECTION);
            expect(system.sections[system.sections.length - 1]).toBe(PRIVACY_CONTACT_SECTION);
        } finally { sections.splice(0, sections.length, ...original); }
    });
    it('requires acknowledgement on fresh accounts and returns saved timestamp', async () => {
        const find = jest.spyOn(PrivacyRepository.prototype, 'find').mockResolvedValue(null);
        await expect(PrivacyController.requireAcknowledgement(7, 'SYSTEM')).rejects.toMatchObject({httpStatus:428});
        find.mockResolvedValue('2026-09-14T12:00:00.000Z');
        expect((await PrivacyController.status(7, 'SYSTEM')).acknowledged).toBe(true);
    });
    it('rejects missing identity, unchecked and stale before writing', async () => {
        await expect(PrivacyController.status(0,'SYSTEM')).rejects.toMatchObject({httpStatus:401});
        await expect(PrivacyController.acknowledge(7,'SYSTEM',{})).rejects.toMatchObject({httpStatus:400});
        await expect(PrivacyController.acknowledge(7,'SYSTEM',{acknowledged:true,version:'old',revision:'1'})).rejects.toMatchObject({httpStatus:409});
    });
    it('saves canonical snapshot then ack, never client person/scope/content', async () => {
        (ToolsDb.transaction as jest.Mock).mockImplementation(async (fn:any) => fn({}));
        const snapshot = jest.spyOn(PrivacyRepository.prototype,'insertSnapshot').mockImplementation(async (_n,_s,h) => h);
        const insert = jest.spyOn(PrivacyRepository.prototype,'insertAcknowledgement').mockResolvedValue();
        jest.spyOn(PrivacyRepository.prototype,'find').mockResolvedValue('now');
        const notice=currentNotice('SYSTEM');
        await PrivacyController.acknowledge(7,'SYSTEM',{...notice,acknowledged:true,personId:999,scope:'PUBLIC_PROFILE'});
        expect(insert.mock.calls[0][0]).toBe(7);
        expect(insert.mock.calls[0][1].scope).toBe('SYSTEM');
        expect(JSON.parse(snapshot.mock.calls[0][1])).toEqual(notice);
        snapshot.mockResolvedValue('different');
        await expect(PrivacyController.acknowledge(7,'SYSTEM',{...notice,acknowledged:true})).rejects.toMatchObject({httpStatus:503});
        expect(insert).toHaveBeenCalledTimes(1);
    });
    it('bypasses only verified machines, lifecycle routes and public flow', async () => {
        const check=jest.spyOn(PrivacyController,'requireAcknowledgement').mockResolvedValue();
        for(const path of ['/session','/V2/PRIVACY/SYSTEM/','/v2/public/experience-update/t']) {
            await gate({path,method:'GET',session:{userData:{enviId:7}}} as any,{locals:{}} as any,jest.fn());
        }
        expect(check).not.toHaveBeenCalled();
        await gate({path:'/persons',method:'POST',session:{userData:{enviId:7}},headers:{'x-agent-token':'fake'}} as any,{locals:{}} as any,jest.fn());
        expect(check).toHaveBeenCalledWith(7,'SYSTEM');
    });
    it('fails closed on database failure', async () => {
        jest.spyOn(PrivacyController,'requireAcknowledgement').mockRejectedValue(new Error('database'));
        const res:any={locals:{},status:jest.fn().mockReturnThis(),send:jest.fn()};
        const next=jest.fn();
        await gate({path:'/persons',method:'POST',session:{userData:{enviId:7}}} as any,res,next);
        expect(res.status).toHaveBeenCalledWith(503); expect(next).not.toHaveBeenCalled();
    });
    function publicMocks() {
        jest.spyOn(PublicRepository.prototype,'findLinkByTokenHash').mockResolvedValue({id:1,personId:7,expiresAt:new Date(Date.now()+86400000).toISOString()} as any);
        jest.spyOn(PublicRepository.prototype,'findSubmissionByLinkId').mockResolvedValue({id:2,personId:7,status:'DRAFT',email:'private@example.test'} as any);
    }
    it('public link alone reveals no profile/email and cannot acknowledge', async () => {
        publicMocks();
        const info:any=await PublicController.getPublicSubmission('link');
        expect(info.email).toBeUndefined(); expect(info.personId).toBeUndefined(); expect(info.items).toEqual([]);
        await expect(PublicController.acknowledgePrivacy('link','',{})).rejects.toMatchObject({httpStatus:401});
    });
    it('public draft and mutations require ack after email verification', async () => {
        publicMocks();
        jest.spyOn(PublicRepository.prototype,'findActiveSessionByHash').mockResolvedValue({id:3} as any);
        const check=jest.spyOn(PrivacyController,'requireAcknowledgement').mockRejectedValue(new Error('blocked'));
        for(const method of ['getDraft','updateDraft','analyzeFile','submit']) {
            await expect((PublicController as any)[method]('link','verified',{})).rejects.toThrow('blocked');
        }
        expect(check).toHaveBeenCalledTimes(4);
        expect(check).toHaveBeenCalledWith(7,'PUBLIC_PROFILE');
    });
});

