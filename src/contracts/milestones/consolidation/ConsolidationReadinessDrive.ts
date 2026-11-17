import type { drive_v3 } from 'googleapis';
import type { ReadinessFile } from './ConsolidationReadinessController';

const options = { timeout: 30000, retry: false };
/** Caller supplies an already authenticated Drive files resource. Only get/list are exposed. */
export default class ConsolidationReadinessDrive {
    constructor(private files: Pick<drive_v3.Resource$Files, 'get' | 'list'>) {}
    async get(id: string): Promise<ReadinessFile> {
        return (await this.files.get({ fileId: id, supportsAllDrives: true,
            fields: 'id,mimeType,trashed,parents,shortcutDetails(targetId),appProperties' }, options)).data;
    }
    async list(parentId: string, pageToken?: string, includeTrashed = false) {
        const parent = parentId.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        return (await this.files.list({ q: `'${parent}' in parents` + (includeTrashed ? '' : ' and trashed = false'), pageToken,
            supportsAllDrives: true, includeItemsFromAllDrives: true, corpora: 'allDrives', spaces: 'drive', pageSize: 1000,
            fields: 'nextPageToken,incompleteSearch,files(id,mimeType,trashed,parents)' }, options)).data;
    }
}
