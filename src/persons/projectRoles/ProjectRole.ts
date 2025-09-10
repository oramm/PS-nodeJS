import {
    ProjectData,
    ProjectRoleData,
} from '../../types/types';
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
}
