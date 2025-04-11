import BusinessObject from '../../BussinesObject';
import ToolsDate from '../../tools/ToolsDate';
import ToolsDb from '../../tools/ToolsDb';
import ToolsGd from '../../tools/ToolsGd';
import CaseType from './cases/caseTypes/CaseType';
import MilestoneType from './milestoneTypes/MilestoneType';
import { OAuth2Client } from 'google-auth-library';
import { drive_v3, google } from 'googleapis';
import Setup from '../../setup/Setup';
import ToolsSheets from '../../tools/ToolsSheets';
import Tools from '../../tools/Tools';
import ScrumSheet from '../../ScrumSheet/ScrumSheet';
import Case from './cases/Case';
import CaseTemplate from './cases/caseTemplates/CaseTemplate';
import mysql from 'mysql2/promise';
import Task from './cases/tasks/Task';
import ProcessInstance from '../../processes/processInstances/ProcessInstance';
import ContractsController from '../ContractsController';
import {
    ExternalOfferData,
    MilestoneData,
    MilestoneDateData,
    MilestoneTypeData,
    OtherContractData,
    OurContractData,
    OurOfferData,
} from '../../types/types';

export default class MilestoneDate
    extends BusinessObject
    implements MilestoneDateData
{
    id?: number;
    milestoneId: number;
    startDate: string;
    endDate: string;
    description?: string | null | undefined;
    lastUpdated?: string;

    constructor(initParamObject: MilestoneDateData) {
        super({ ...initParamObject, _dbTableName: 'MilestoneDates' });
        if (!initParamObject.milestoneId)
            throw new Error('Milestone not defined for dates');

        this.id = initParamObject.id;
        this.milestoneId = initParamObject.milestoneId;
        this.description = initParamObject.description;
        this.startDate = ToolsDate.dateJsToSql(
            initParamObject.startDate
        ) as string;

        this.endDate = ToolsDate.dateJsToSql(initParamObject.endDate) as string;
        this.lastUpdated = initParamObject.lastUpdated;
    }
}
