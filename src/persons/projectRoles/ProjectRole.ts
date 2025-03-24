import { PoolConnection } from 'mysql2/promise';
import {
    OtherContractData,
    OurContractData,
    ProjectData,
    ProjectRoleData,
} from '../../types/types';
import ContractRole from './ContractRole';
import ToolsDb from '../../tools/ToolsDb';
import RolesController from './RolesController';
import ContractsController from '../../contracts/ContractsController';

export default class ProjectRole
    extends ContractRole
    implements ProjectRoleData
{
    projectOurId?: string | null;
    _project?: ProjectData;

    constructor(initParamObject: ProjectRoleData) {
        super({ ...initParamObject });
        this._project = initParamObject._project;
        this.projectOurId =
            initParamObject.projectOurId || this._project?.ourId || null;
    }

    /**
     * Dodaje wpisy dla wszystkich kontraktów przypisanych do projektu
     */
    async addInDb(
        externalConn?: PoolConnection,
        isPartOfTransaction?: boolean
    ): Promise<any> {
        if (!this.projectOurId)
            throw new Error('ProjectRole must have projectId to be added');
        const contracts = await ContractsController.getContractsList([
            { projectOurId: this.projectOurId },
        ]);
        console.log('Adding roles for contracts in project ');
        return ToolsDb.transaction(async (conn) => {
            const promises: Promise<ProjectRoleData>[] = [];
            for (const contract of contracts) {
                const projectRoleInstanceForContract = new ProjectRole({
                    ...this,
                    contractId: contract.id,
                });
                promises.push(
                    projectRoleInstanceForContract.addInDbForContract(conn)
                );
            }
            const result = await Promise.all(promises);
            console.log(
                `Roles added for  ${result.length} contracts in project `
            );
            return result[0];
        }, externalConn);
    }

    /**
     * Dodaje kopię roli dla kontraktu
     */
    private async addInDbForContract(
        externalConn: PoolConnection
    ): Promise<any> {
        if (!this.projectOurId || !this.contractId)
            throw new Error(
                'ProjectRole must have projectId and contractId to be added'
            );
        return super.addInDb(externalConn, true);
    }

    /**
     * Edytuje wpisy dla wszystkich kontraktów przypisanych do projektu
     */
    async editInDb(
        externalConn?: PoolConnection,
        isPartOfTransaction?: boolean,
        _fieldsToUpdate?: string[]
    ): Promise<any> {
        if (!this.projectOurId)
            throw new Error('ProjectRole must have projectId to be edited');
        const rolePerContracts = (await RolesController.getRolesList([
            { projectOurId: this.projectOurId, _person: this._person },
        ])) as ProjectRoleData[];
        console.log('Editing roles for contracts in project ');
        return ToolsDb.transaction(async (conn) => {
            const promises: Promise<ProjectRoleData>[] = [];

            for (const role of rolePerContracts) {
                const projectRole = new ProjectRole({
                    ...this,
                    id: role.id,
                    contractId: role.contractId,
                });
                promises.push(
                    projectRole.editInDbForContract(conn, _fieldsToUpdate)
                );
            }
            const result = await Promise.all(promises);
            return result[0];
        }, externalConn);
    }

    private async editInDbForContract(
        externalConn: PoolConnection,
        _fieldsToUpdate?: string[]
    ): Promise<any> {
        console.log('Editing role for contract ', this.contractId);
        return super.editInDb(externalConn, true, _fieldsToUpdate);
    }

    /**
     * Usuwa wpisy dla wszystkich kontraktów przypisanych do projektu
     */
    async deleteFromDb(
        externalConn?: PoolConnection,
        isPartOfTransaction?: boolean
    ) {
        if (!this.projectOurId)
            throw new Error('ProjectRole must have projectId to be deleted');
        const rolePerProject = (await RolesController.getRolesList([
            { projectOurId: this.projectOurId, _person: this._person },
        ])) as ProjectRoleData[];
        console.log('Deleting roles for contracts in project ');
        return ToolsDb.transaction(async (conn) => {
            const promises: Promise<ProjectRoleData>[] = [];

            for (const role of rolePerProject) {
                const projectRole = new ProjectRole(role);
                promises.push(projectRole.deleteFromDbForContract(conn));
            }
            const result = await Promise.all(promises);
            return result[0];
        }, externalConn);
    }

    private async deleteFromDbForContract(externalConn: PoolConnection) {
        return super.deleteFromDb(externalConn, true);
    }
}
