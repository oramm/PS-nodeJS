import ToolsDb from '../../tools/ToolsDb';
import { ProjectRoleData, ContractRoleData } from '../../types/types';
import ProjectRole from './ProjectRole';
import ContractRole from './ContractRole';
import RoleRepository, { RolesSearchParams } from './RoleRepository';
import BaseController from '../../controllers/BaseController';
import ContractsController from '../../contracts/ContractsController';

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

    static async addNewRole(
        roleData: ContractRoleData | ProjectRoleData
    ): Promise<any> {
        this.validateRole(roleData);
        const instance = this.getInstance();
        const item = this.createProperRole(roleData);

        if (item instanceof ProjectRole) {
            if (!item.projectOurId)
                throw new Error(
                    'ProjectRole must have projectOurId to be added'
                );
            const contracts = await ContractsController.find([
                { projectOurId: item.projectOurId },
            ]);

            await ToolsDb.transaction(async (conn) => {
                const promises: Promise<ProjectRoleData>[] = [];
                for (const contract of contracts) {
                    const projectRoleInstanceForContract = new ProjectRole({
                        ...item,
                        contractId: contract.id,
                    });
                    // Walidacja przed zapisem
                    projectRoleInstanceForContract.validate();
                    promises.push(
                        instance.create(
                            projectRoleInstanceForContract,
                            conn,
                            true
                        )
                    );
                }
                await Promise.all(promises);
                console.log(
                    `Roles added for ${contracts.length} contracts in project `
                );
            });
        } else {
            await instance.create(item);
        }
        return item;
    }

    static async updateRole(
        roleData: ContractRoleData | ProjectRoleData,
        fieldsToUpdate?: string[]
    ): Promise<any> {
        this.validateRole(roleData);
        const instance = this.getInstance();
        const item = this.createProperRole(roleData);

        if (item instanceof ProjectRole) {
            if (!item.projectOurId)
                throw new Error('ProjectRole must have projectOurId');
            const rolesToUpdate = (await this.find([
                { projectOurId: item.projectOurId, _person: item._person },
            ])) as ProjectRoleData[];

            await ToolsDb.transaction(async (conn) => {
                const promises: Promise<ProjectRoleData>[] = [];

                for (const role of rolesToUpdate) {
                    const updatedRole = new ProjectRole({
                        ...item,
                        id: role.id,
                        contractId: role.contractId,
                    });
                    // Walidacja przed edycją
                    updatedRole.validate();
                    console.log(
                        'Editing role for contract ',
                        updatedRole.contractId
                    );
                    promises.push(
                        instance.edit(updatedRole, conn, true, fieldsToUpdate)
                    );
                }
                const result = await Promise.all(promises);
                return result[0];
            });
        } else {
            await instance.edit(item, undefined, undefined, fieldsToUpdate);
        }
        return item;
    }

    static async deleteRole(
        roleData: ContractRoleData | ProjectRoleData
    ): Promise<any> {
        this.validateRole(roleData);
        const instance = this.getInstance();
        const item = this.createProperRole(roleData);

        if (item instanceof ProjectRole) {
            if (!item.projectOurId)
                throw new Error('ProjectRole must have projectOurId');
            const rolesToDelete = (await this.find([
                { projectOurId: item.projectOurId, _person: item._person },
            ])) as ProjectRoleData[];

            await ToolsDb.transaction(async (conn) => {
                const promises: Promise<ProjectRoleData>[] = [];

                for (const role of rolesToDelete) {
                    const projectRole = new ProjectRole(role);
                    // Walidacja przed usunięciem (opcjonalna, ale dla spójności)
                    projectRole.validate();
                    console.log(
                        'Deleting role for contract ',
                        projectRole.contractId
                    );
                    promises.push(instance.delete(projectRole, conn, true));
                }
                const result = await Promise.all(promises);
                return result[0];
            });
        } else {
            await instance.delete(item);
        }
        return { id: item.id };
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
