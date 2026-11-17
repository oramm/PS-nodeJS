import ToolsDb from '../../tools/ToolsDb';
import { SystemRoleName } from '../../types/sessionTypes';
import ProjectAssignmentRepository from '../projectAssignments/ProjectAssignmentRepository';
import { MembershipEdge } from '../projectAssignments/projectMembership';
import MailboxRepository from '../../mailboxes/MailboxRepository';
import ChatSpaceRepository from '../../contracts/chatSpaces/ChatSpaceRepository';
import SbAccessValidator from '../../sbAccess/SbAccessValidator';
import { MailboxOwnerRow } from '../../mailboxes/mailboxAccessPolicy';
import { SB_MANAGER_ROLES } from '../../sbAccess/sbAccessPolicy';
import { SpaceContractRow } from '../../contracts/chatSpaces/ChatSpaceRepository';
import { LetterContract } from './personAccess';

export interface AccessPersonRow {
    personId: number;
    name: string;
    surname: string;
    entityName: string | null;
    systemRoleId: number;
    role: SystemRoleName;
    /** Jak SbAccessController.canManage: rola kierownicza i aktywny znacznik CanManageSbAccess. */
    managesSb: boolean;
}

export interface AccessContext {
    edges: MembershipEdge[];
    letterContracts: LetterContract[];
    mailboxes: (MailboxOwnerRow & { createdByPersonId: number | null })[];
    manualMailCodes: Map<number, string[]>;
    spaceRows: SpaceContractRow[];
    projectNames: Map<string, string>;
}

/** Odczyty do przeglądu dostępów (DOSTEP-7). Same dane - reguły są w personAccess i w funkcjach, które ono woła. */
export default class AccessOverviewRepository {
    /**
     * Osoby, które mogą się zalogować: aktywne konto z rolą i e-mailem systemowym
     * (ten sam warunek konta co logowanie, PersonRepository - PersonAccounts.IsActive = 1).
     */
    static async findPersons(personId?: number): Promise<AccessPersonRow[]> {
        const rows = (await ToolsDb.getQueryCallbackAsync(
            `SELECT p.Id AS personId, p.Name AS name, p.Surname AS surname, e.Name AS entityName,
                pa.SystemRoleId AS systemRoleId, sr.Name AS role,
                COALESCE(sm.CanManageSbAccess = 1, 0) AS sbFlag
            FROM Persons p
            JOIN PersonAccounts pa ON pa.PersonId = p.Id AND pa.IsActive = 1
            JOIN SystemRoles sr ON sr.Id = pa.SystemRoleId
            LEFT JOIN Entities e ON e.Id = p.EntityId
            LEFT JOIN StaffMembers sm ON sm.PersonId = p.Id
            WHERE pa.SystemEmail IS NOT NULL AND pa.SystemEmail <> ''${personId !== undefined ? ' AND p.Id = ?' : ''}
            ORDER BY p.Surname, p.Name`,
            undefined,
            personId !== undefined ? [personId] : [],
        )) as any[];
        return rows.map(({ sbFlag, ...r }) => ({
            ...r,
            personId: Number(r.personId),
            systemRoleId: Number(r.systemRoleId),
            managesSb: !!Number(sbFlag) && SB_MANAGER_ROLES.includes(r.role),
        }));
    }

    static async roleNameById(systemRoleId: number): Promise<SystemRoleName | undefined> {
        const rows = (await ToolsDb.getQueryCallbackAsync(
            `SELECT Name FROM SystemRoles WHERE Id = ?`, undefined, [systemRoleId],
        )) as any[];
        return rows[0]?.Name;
    }

    static async loadContext(personId?: number): Promise<AccessContext> {
        const [edges, letterRows, mailboxes, creatorRows, sbRows, spaceIdRows, projectRows] = await Promise.all([
            ProjectAssignmentRepository.findMembership(personId !== undefined ? { personId } : {}),
            ToolsDb.getQueryCallbackAsync(
                `SELECT pc.PersonId AS personId, pc.ContractId AS contractId,
                    COALESCE(NULLIF(ocd.OurId, ''), NULLIF(c.Number, ''), CONCAT('nr ', c.Id)) AS label
                FROM Persons_Contracts pc
                JOIN Contracts c ON c.Id = pc.ContractId
                LEFT JOIN OurContractsData ocd ON ocd.Id = c.Id
                ${personId !== undefined ? 'WHERE pc.PersonId = ?' : ''}
                ORDER BY label`,
                undefined,
                personId !== undefined ? [personId] : [],
            ) as Promise<any[]>,
            // includePending jak MailboxController.personCodes - ta sama odpowiedź, co przy wejściu do skrzynki.
            new MailboxRepository().findOwners(true),
            // Zakładający to osobna furtka MailboxController.assertAccess, nie droga reguły przynależności.
            ToolsDb.getQueryCallbackAsync(`SELECT Code AS code, CreatedByPersonId AS createdByPersonId FROM Mailboxes`) as Promise<any[]>,
            ToolsDb.getQueryCallbackAsync(`SELECT PersonId AS personId, Levels AS levels FROM SbAccess`) as Promise<any[]>,
            ToolsDb.getQueryCallbackAsync(`SELECT Id AS id FROM ChatSpaces`) as Promise<any[]>,
            ToolsDb.getQueryCallbackAsync(`SELECT OurId AS ourId, Name AS name FROM Projects`) as Promise<any[]>,
        ]);
        const spaceIds = spaceIdRows.map((r) => Number(r.id));
        return {
            edges,
            letterContracts: letterRows.map((r) => ({ personId: Number(r.personId), contractId: Number(r.contractId), label: r.label })),
            mailboxes: mailboxes.map((m) => ({
                ...m,
                createdByPersonId: Number(creatorRows.find((r) => r.code === m.code)?.createdByPersonId) || null,
            })),
            manualMailCodes: new Map(sbRows.map((r) => [Number(r.personId), SbAccessValidator.levelsFromDb(r.levels).mail ?? []])),
            spaceRows: spaceIds.length ? await new ChatSpaceRepository().spacesWithContracts([], spaceIds) : [],
            projectNames: new Map(projectRows.map((r) => [r.ourId, r.name])),
        };
    }
}
