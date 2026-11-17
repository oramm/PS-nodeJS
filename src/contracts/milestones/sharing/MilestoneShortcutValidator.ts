import { drive_v3 } from 'googleapis';
import SharingError from './MilestoneSharingError';

export default class MilestoneShortcutValidator {
    static folders(target?: string, parent?: string) {
        if (!target || !parent) throw new SharingError('SHORTCUT_NOT_READY', 503);
        if (target === parent) throw new SharingError('FOLDER_ALIAS');
    }

    static folder(file: drive_v3.Schema$File, id: string, writable = false) {
        if (file.id !== id || file.trashed !== false || file.mimeType !== 'application/vnd.google-apps.folder' ||
            (writable && file.capabilities?.canAddChildren !== true))
            throw new SharingError('DRIVE_STATE_UNCERTAIN');
    }

    static removable(file: drive_v3.Schema$File, id: string, target: string, parent: string, owner: string) {
        if (typeof file.trashed !== 'boolean') throw new SharingError('DRIVE_STATE_UNCERTAIN');
        this.shortcut(file, id, target, parent, owner, file.trashed);
        if (!file.trashed && file.capabilities?.canTrash !== true)
            throw new SharingError('SHORTCUT_NOT_READY', 503);
    }

    static shortcut(file: drive_v3.Schema$File, id: string, target: string, parent: string, owner: string, trashed = false) {
        if (file.id !== id || file.trashed !== trashed || file.mimeType !== 'application/vnd.google-apps.shortcut' ||
            file.shortcutDetails?.targetId !== target || file.parents?.length !== 1 || file.parents[0] !== parent ||
            file.appProperties?.psMilestoneLink !== owner)
            throw new SharingError('DRIVE_STATE_UNCERTAIN');
    }
}
