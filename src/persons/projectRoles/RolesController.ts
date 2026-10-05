import ToolsDb from '../../tools/ToolsDb';
import { ProjectRoleData, ContractRoleData } from '../../types/types';
import ProjectRole from './ProjectRole';
import ContractRole from './ContractRole';
import RoleRepository, { RolesSearchParams } from './RoleRepository';
import BaseController from '../../controllers/BaseController';
import mysql from 'mysql2/promise';
import {
    enqueueFidmanPersonnelForRoles,
    FidmanRoleScope,
    tryDeliverAfterCommit,
} from '../../contracts/fidmanSync/FidmanSync';

export type { RolesSearchParams };

export default class RolesController extends BaseController<
    ContractRole,
    RoleRepository
> {
    private static instance: RolesController;

    constructor() {
        super(new RoleRepository());
    }

    private static getInstance(): RolesController {
        if (!this.instance) {
            this.instance = new RolesController();
        }
        return this.instance;
    }

    static async find(
        orConditions: RolesSearchParams[] = []
    ): Promise<(ProjectRole | ContractRole)[]> {
        const instance = this.getInstance();
        return instance.repository.find(orConditions);
    }

    static async addNewRole(roleData: ContractRoleData | ProjectRoleData): Promise<any> {
        this.validateRole(roleData);
        const item = this.createProperRole(roleData);
        const instance = this.getInstance();
        const outboxIds = await ToolsDb.transaction<number[]>(async (conn) => {
            const scopes: FidmanRoleScope[] = [];
            if (item instanceof ProjectRole) {
                for (const contractId of await instance.repository.projectContractIds(item.projectOurId!, conn)) {
                    const copy = new ProjectRole({ ...item, _contract: undefined, contractId });
                    copy.validate();
                    await instance.repository.addInDb(copy, conn, true);
                    scopes.push({ ContractId: contractId, ProjectOurId: item.projectOurId! });
                }
            } else {
                await instance.repository.addInDb(item, conn, true);
                scopes.push({ ContractId: item.contractId ?? null, ProjectOurId: null });
            }
            return this.enqueuePersonnel(scopes, conn);
        });
        for (const id of outboxIds) await tryDeliverAfterCommit(id);
        return item;
    }

    static async updateRole(
        roleData: ContractRoleData | ProjectRoleData,
        fieldsToUpdate?: string[]
    ): Promise<any> {
        this.validateRole(roleData);
        const item = this.createProperRole(roleData);
        const instance = this.getInstance();
        const outboxIds = await ToolsDb.transaction<number[]>(async (conn) => {
            const oldRows = await instance.repository.rolesForMutation(item.id, conn);
            const movingProject = item instanceof ProjectRole &&
                (!fieldsToUpdate || fieldsToUpdate.includes('projectOurId')) &&
                oldRows.some((old) => old.ContractId != null && old.ProjectOurId !== item.projectOurId);
            const movingToContract = !(item instanceof ProjectRole) &&
                (!fieldsToUpdate || fieldsToUpdate.includes('contractId')) &&
                oldRows.some((old) => old.ProjectOurId);
            const scopes: FidmanRoleScope[] = [];
            for (const old of oldRows) {
                scopes.push(old);
                if (movingToContract && old.Id !== item.id) {
                    // Tylko edytowany wiersz zostaje rolą umowy; pozostałe kopie znikają.
                    await instance.repository.deleteFromDb(new ContractRole({ ...item, id: old.Id }), conn, true);
                } else if (movingProject) {
                    // Przeniesienie projektu odtwarza kopie w umowach nowego projektu.
                    await instance.repository.deleteFromDb(new ContractRole({ ...item, id: old.Id }), conn, true);
                } else {
                    const updated = item instanceof ProjectRole
                        ? new ProjectRole({ ...item, id: old.Id, _contract: undefined,
                            contractId: old.ProjectOurId ? old.ContractId : item.contractId })
                        : new ContractRole({ ...item, id: old.Id });
                    if (!(item instanceof ProjectRole) && old.ProjectOurId) {
                        // Przeniesienie do roli umowy usuwa stare powiązanie projektu.
                        (updated as ContractRole & { projectOurId: null }).projectOurId = null;
                    }
                    await instance.repository.editInDb(updated, conn, true,
                        movingToContract && fieldsToUpdate
                            ? [...new Set([...fieldsToUpdate, 'projectOurId'])]
                            : fieldsToUpdate);
                }
            }
            if (movingProject && item instanceof ProjectRole) {
                for (const contractId of await instance.repository.projectContractIds(item.projectOurId!, conn)) {
                    const copy = new ProjectRole({ ...item, id: undefined as any,
                        _contract: undefined, contractId });
                    copy.validate();
                    await instance.repository.addInDb(copy, conn, true);
                    scopes.push({ ContractId: contractId, ProjectOurId: item.projectOurId! });
                }
            }
            // Stan zapisany w bazie uwzględnia również fieldsToUpdate i obie strony przeniesienia.
            const newRows = await instance.repository.readScopes(
                oldRows.map((row) => row.Id), conn
            );
            scopes.push(...newRows as FidmanRoleScope[]);
            return this.enqueuePersonnel(scopes, conn);
        });
        for (const id of outboxIds) await tryDeliverAfterCommit(id);
        return item;
    }

    static async deleteRole(roleData: ContractRoleData | ProjectRoleData): Promise<any> {
        this.validateRole(roleData);
        const item = this.createProperRole(roleData);
        const instance = this.getInstance();
        const outboxIds = await ToolsDb.transaction<number[]>(async (conn) => {
            // Tylko kopie tej samej roli osoby w projekcie; inne role osoby zostają.
            const rows = await instance.repository.rolesForDeletion(item.id, conn);
            for (const row of rows) {
                await instance.repository.deleteFromDb(new ContractRole({ ...item, id: row.Id }), conn, true);
            }
            return this.enqueuePersonnel(rows, conn);
        });
        for (const id of outboxIds) await tryDeliverAfterCommit(id);
        return { id: item.id };
    }

    private static async enqueuePersonnel(scopes: FidmanRoleScope[], conn: mysql.PoolConnection): Promise<number[]> {
        // Kopie ról projektu zbiorczego nie mogą rozwinąć worka drobnych zleceń.
        return enqueueFidmanPersonnelForRoles(scopes.filter((scope) =>
            !scope.ProjectOurId?.startsWith('ROZNE.')), conn);
    }

    static validateRole(role: ContractRoleData | ProjectRoleData) {
        if (
            !(role as ProjectRoleData)._project?.ourId &&
            !(role as ContractRoleData)._contract?.id
        ) {
            throw new Error('Role must have either a project or a contract');
        }
    }

    static createProperRole(initParams: ProjectRoleData | ContractRoleData) {
        return (initParams as ProjectRoleData)._project?.ourId
            ? new ProjectRole(initParams)
            : new ContractRole(initParams);
    }

}
