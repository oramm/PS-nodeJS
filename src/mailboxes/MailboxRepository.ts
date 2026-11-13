import ToolsDb from '../tools/ToolsDb';

/** Skrzynka poczty ze spisu PS (plan MBX); bez haseł. */
export interface MailboxRecord {
    code: string;
    address: string;
    projectId: number | null;
    contractId: number | null;
    statusCode: string;
}

export default class MailboxRepository {
    async find(): Promise<MailboxRecord[]> {
        return (await ToolsDb.getQueryCallbackAsync(
            `SELECT Code AS code, Address AS address, ProjectId AS projectId,
                ContractId AS contractId, StatusCode AS statusCode
            FROM Mailboxes ORDER BY Code`,
        )) as MailboxRecord[];
    }
}
