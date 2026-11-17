import { OAuth2Client } from 'google-auth-library';
import BaseController from '../../../controllers/BaseController';
import ToolsDb from '../../../tools/ToolsDb';
import Drive from '../../../tools/MilestoneShortcutDrive';
import Link from './MilestoneContractLink';
import LinkRepository from './MilestoneContractLinkRepository';
import Repository from './MilestoneSharingRepository';
import Validator from './MilestoneShortcutValidator';
import SharingValidator from './MilestoneSharingValidator';
import SharingError from './MilestoneSharingError';

const repository = new Repository();

export default class MilestoneShortcutController extends BaseController<Link, LinkRepository> {
    constructor() { super(new LinkRepository()); }

    // The caller persists the intent and holds the lifecycle lock, without a DB transaction.
    static async remove(id: string, target: string, parent: string, owner: string, auth?: OAuth2Client) {
        try {
            Validator.folders(target, parent);
            await this.withAuth(async (_instance, client) => {
                Validator.folder(await Drive.get(client, target), target);
                Validator.folder(await Drive.get(client, parent), parent);
                const file = await Drive.get(client, id);
                Validator.removable(file, id, target, parent, owner);
                if (!file.trashed) await Drive.trash(client, id);
                // A timeout or even a 404 is not proof of absence/access. Retry reads the same ID.
                Validator.shortcut(await Drive.get(client, id), id, target, parent, owner, true);
                Validator.folder(await Drive.get(client, target), target);
                Validator.folder(await Drive.get(client, parent), parent);
            }, auth);
        } catch (error) {
            if (error instanceof SharingError) throw error;
            throw new SharingError('SHORTCUT_NOT_READY', 503);
        }
    }

    // Caller must hold the sharing lifecycle lock and have committed the association.
    static async ensure(milestoneId: number, contractId: number, auth?: OAuth2Client) {
        const s = await repository.snapshot(milestoneId);
        const link = s.links.find(l => l.ContractId === contractId);
        SharingValidator.exists(link);
        SharingValidator.idle(s.links);
        const contracts = await repository.contracts([contractId]);
        const target = s.m.GdFolderId, parent = contracts[0]?.GdFolderId;
        try {
            Validator.folders(target, parent);
            await this.withAuth(async (_instance, client) => {
                Validator.folder(await Drive.get(client, target), target);
                Validator.folder(await Drive.get(client, parent), parent, true);
                let id = link.ShortcutId as string | null;
                if (!id) {
                    id = await Drive.reserve(client);
                    // Commit identity BEFORE create. A timeout/restart always reuses this ID.
                    await ToolsDb.transaction(async conn => {
                        await repository.shortcutState(milestoneId, contractId, id!, 'PENDING', conn);
                        await repository.touch(milestoneId, conn);
                    });
                }
                const owner = `${milestoneId}:${contractId}`;
                let file;
                try { file = await Drive.get(client, id); }
                catch (error: any) {
                    // 403/5xx is not absence. A 404 can also mean no access; create with the
                    // SAME ID cannot duplicate an inaccessible existing file.
                    if (Number(error?.response?.status ?? error?.code) !== 404) throw error;
                    try { await Drive.create(client, id, target, parent, s.m.Name, owner); }
                    catch (createError: any) {
                        if (Number(createError?.response?.status ?? createError?.code) !== 409) throw createError;
                    }
                    file = await Drive.get(client, id);
                }
                Validator.shortcut(file, id, target, parent, owner);
                // Recheck canonical target access before advertising READY.
                Validator.folder(await Drive.get(client, target), target);
                await ToolsDb.transaction(async conn => {
                    await repository.shortcutState(milestoneId, contractId, id!, 'READY', conn);
                    await repository.touch(milestoneId, conn);
                });
            }, auth);
        } catch (_error) {
            // Preserve committed identity for the next attempt; never echo OAuth/transport errors.
            await ToolsDb.transaction(async conn => {
                await repository.shortcutFailed(milestoneId, contractId, conn);
                await repository.touch(milestoneId, conn);
            });
        }
    }
}
