import ToolsDb from '../tools/ToolsDb';
import { MailboxAssigneeRow } from './mailboxAccessPolicy';

/** Skrzynka poczty ze spisu PS (plan MBX); bez haseł. */
export interface MailboxRecord {
    code: string;
    address: string;
    projectId: number | null;
    contractId: number | null;
    statusCode: string;
}

export default class MailboxRepository {
    /**
     * Aktywne skrzynki z kierownikiem i administratorem kontraktów, do których należą
     * (skrzynka projektu: wszystkie kontrakty projektu; ogólnofirmowa: jeden wiersz z null-ami).
     * Kto z tego ma dostęp, rozstrzyga `personMailboxes` - tu tylko SQL.
     */
    async findWithAssignees(): Promise<MailboxAssigneeRow[]> {
        return (await ToolsDb.getQueryCallbackAsync(
            `SELECT DISTINCT m.Code AS code, m.Address AS address, o.ManagerId AS managerId, o.AdminId AS adminId
            FROM Mailboxes m
            LEFT JOIN Contracts c ON c.Id = m.ContractId
                OR (m.ProjectId IS NOT NULL AND c.ProjectOurId = (SELECT OurId FROM Projects WHERE Id = m.ProjectId))
            LEFT JOIN OurContractsData o ON o.Id = c.Id
            WHERE m.StatusCode = 'ACTIVE'`,
        )) as MailboxAssigneeRow[];
    }


    async find(): Promise<MailboxRecord[]> {
        return (await ToolsDb.getQueryCallbackAsync(
            `SELECT Code AS code, Address AS address, ProjectId AS projectId,
                ContractId AS contractId, StatusCode AS statusCode
            FROM Mailboxes ORDER BY Code`,
        )) as MailboxRecord[];
    }
}
