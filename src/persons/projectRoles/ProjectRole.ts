import { ProjectData, ProjectRoleData } from '../../types/types';
import ContractRole from './ContractRole';

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
     * Waliduje czy ProjectRole ma wszystkie wymagane dane
     * Wywołaj przed dodaniem/edycją przez Repository
     */
    validate(): void {
        if (!this.projectOurId) {
            throw new Error('ProjectRole must have projectOurId');
        }
        if (!this.contractId) {
            throw new Error('ProjectRole must have contractId');
        }
    }
}
