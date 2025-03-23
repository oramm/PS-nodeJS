import { PoolConnection } from 'mysql2/promise';
import { ContractData, ProjectData, ProjectRoleData } from '../../types/types';
import Role from './Role';
import ContractsController from '../../contracts/ContractsController';
import ContractRole from './ContractRole';
import ToolsDb from '../../tools/ToolsDb';
import RolesController from './RolesController';

export default class ProjectRole extends Role implements ProjectRoleData {
    projectOurId?: string | null;
    _project?: ProjectData;

    constructor(initParamObject: ProjectRoleData) {
        super({ ...initParamObject });
        this._project = initParamObject._project;
        this.projectOurId =
            initParamObject.projectOurId || this._project?.ourId || null;
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
        const contractRoles = await RolesController.getRolesList([
            { projectOurId: this.projectOurId },
        ]);
        if (!contractRoles.length)
            throw new Error('No contract roles found for this project');
        console.log('Editing contract roles for project role');
        return ToolsDb.transaction(async (conn) => {
            const promises: Promise<ContractData>[] = [];

            for (const role of contractRoles) {
                const contractRole = new ContractRole({
                    ...this,
                });
                promises.push(
                    contractRole.editInDb(conn, true, _fieldsToUpdate)
                );
            }
            await Promise.all(promises);
            return super.editInDb(conn, isPartOfTransaction, _fieldsToUpdate);
        }, externalConn);
    }
}
