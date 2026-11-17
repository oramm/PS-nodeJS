import type { drive_v3 } from 'googleapis';
import ReadinessDrive from './ConsolidationReadinessDrive';
const options = { timeout: 30000, retry: false };
/** Only recoverable trash/restore of the checked root is available. No permanent delete. */
export default class ConsolidationFinalizationDrive extends ReadinessDrive {
    constructor(private resource: Pick<drive_v3.Resource$Files,'get'|'list'|'update'>) { super(resource); }
    async trash(id: string, trashed: boolean) {
        return (await this.resource.update({fileId:id,supportsAllDrives:true,requestBody:{trashed},fields:'id,mimeType,trashed,parents'},options)).data;
    }
}
