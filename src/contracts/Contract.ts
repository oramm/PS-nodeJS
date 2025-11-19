import ToolsGd from '../tools/ToolsGd';
import ToolsDate from '../tools/ToolsDate';
import { OAuth2Client } from 'google-auth-library';
import ContractType from './contractTypes/ContractType';
import mysql from 'mysql2/promise';
import BusinessObject from '../BussinesObject';
import ToolsDb from '../tools/ToolsDb';
import ContractEntity from './ContractEntity';
import Milestone from './milestones/Milestone';
import {
    ContractData,
    ContractRangePerContractData,
    ContractRangeData,
    EntityData,
    ProjectData,
} from '../types/types';
import ContractRangeContract from './contractRangesContracts/ContractRangeContract';
import CurrentSprintValidator from '../ScrumSheet/CurrentSprintValidator';
import TaskStore from '../setup/Sessions/IntersessionsTasksStore';

export default abstract class Contract
    extends BusinessObject
    implements ContractData
{
    id?: number;
    alias: string;
    typeId: number;
    _type: ContractType;
    number: string;
    name: string = '';
    projectOurId: string;
    startDate?: string;
    endDate?: string;
    guaranteeEndDate?: string;
    value?: string | number;
    _remainingNotScheduledValue?: string | number;
    _remainingNotIssuedValue?: string | number;
    comment: string;
    gdFolderId?: string;
    _gdFolderUrl?: string;
    meetingProtocolsGdFolderId?: string;
    _ourIdOrNumber_Name?: string;
    _ourIdOrNumber_Alias?: string;
    _contractors?: EntityData[];
    _engineers?: EntityData[];
    _employers?: EntityData[];
    status: string;
    _project: ProjectData;
    _folderName?: string;
    _lastUpdated?: string;
    _contractRangesPerContract: ContractRangePerContractData[] = [];
    _contractRangesNames?: string[] = [];

    constructor(initParamObject: any, conn?: mysql.PoolConnection) {
        super({ ...initParamObject, _dbTableName: 'Contracts' });
        this.id = initParamObject.id;
        this.alias = initParamObject.alias;
        this.typeId = initParamObject._type?.id;
        this._type = initParamObject._type;
        this.number = initParamObject.number;
        this.name = initParamObject.name;

        this.startDate = ToolsDate.dateJsToSql(initParamObject.startDate);
        this.endDate = ToolsDate.dateJsToSql(initParamObject.endDate);
        this.guaranteeEndDate = ToolsDate.dateJsToSql(
            initParamObject.guaranteeEndDate
        );
        if (initParamObject.value) {
            if (typeof initParamObject.value === 'string') {
                initParamObject.value = initParamObject.value
                    .replace(/\s/g, '')
                    .replace(/,/g, '.')
                    .replace(/[^0-9.-]/g, '');
                this.value = parseFloat(initParamObject.value);
            } else {
                this.value = initParamObject.value;
            }
        }
        if (initParamObject._remainingNotScheduledValue) {
            if (
                typeof initParamObject._remainingNotScheduledValue === 'string'
            ) {
                initParamObject._remainingNotScheduledValue =
                    initParamObject._remainingNotScheduledValue
                        .replace(/\s/g, '')
                        .replace(/,/g, '.')
                        .replace(/[^0-9.-]/g, '');
                this._remainingNotScheduledValue = parseFloat(
                    initParamObject._remainingNotScheduledValue
                );
            } else {
                this._remainingNotScheduledValue =
                    initParamObject._remainingNotScheduledValue;
            }
        }

        if (initParamObject._remainingNotIssuedValue) {
            if (typeof initParamObject._remainingNotIssuedValue === 'string') {
                initParamObject._remainingNotIssuedValue =
                    initParamObject._remainingNotIssuedValue
                        .replace(/\s/g, '')
                        .replace(/,/g, '.')
                        .replace(/[^0-9.-]/g, '');
                this._remainingNotIssuedValue = parseFloat(
                    initParamObject._remainingNotIssuedValue
                );
            } else {
                this._remainingNotIssuedValue =
                    initParamObject._remainingNotIssuedValue;
            }
        }
        this.comment = initParamObject.comment;

        if (initParamObject.gdFolderId)
            this.setGdFolderIdAndUrl(initParamObject.gdFolderId);
        this.meetingProtocolsGdFolderId =
            initParamObject.meetingProtocolsGdFolderId;

        this._contractors = initParamObject._contractors
            ? initParamObject._contractors
            : [];
        this._engineers = initParamObject._engineers
            ? initParamObject._engineers
            : [];
        this._employers = initParamObject._employers
            ? initParamObject._employers
            : [];

        this._contractRangesPerContract = [];
        if (
            initParamObject._contractRanges &&
            Array.isArray(initParamObject._contractRanges)
        ) {
            this._contractRangesPerContract =
                initParamObject._contractRanges.map((item: any) => {
                    if (
                        item &&
                        typeof item === 'object' &&
                        item.hasOwnProperty('_contractRange')
                    ) {
                        return item;
                    }
                    return { _contractRange: item };
                });
        } else if (initParamObject._contractRangesPerContract) {
            this._contractRangesPerContract =
                initParamObject._contractRangesPerContract;
        }
        this._contractRangesNames = initParamObject._contractRangesNames;
        this._project = initParamObject._project;
        this.projectOurId = this._project?.ourId;

        this.status = initParamObject.status;
        this._lastUpdated = initParamObject._lastUpdated;
    }

    // addNewController + editHandler przeniesione do ContractsController (zob. Phase 2-3 refactor)

    setGdFolderIdAndUrl(gdFolderId: string) {
        this.gdFolderId = gdFolderId;
        this._gdFolderUrl = ToolsGd.createGdFolderUrl(gdFolderId);
    }

    setEntitiesFromParent() {
        if (this._employers?.length == 0)
            this._employers = this._project._employers;
    }
    async setContractRootFolder(auth: OAuth2Client) {
        return await ToolsGd.setFolder(auth, {
            parentId: <string>this._project?.gdFolderId,
            name: <string>this._folderName,
        });
    }

    async createFolders(auth: OAuth2Client) {
        const folder = await this.setContractRootFolder(auth);
        this.setGdFolderIdAndUrl(folder.id as string);
        const meetingNotesFolder = await ToolsGd.setFolder(auth, {
            parentId: <string>this._project.gdFolderId,
            name: 'Notatki ze spotkań',
        });
        this.meetingProtocolsGdFolderId = <string>meetingNotesFolder.id;
    }

    async addEntitiesAssociationsInDb(
        externalConn: mysql.PoolConnection,
        isPartOfTransaction?: boolean
    ) {
        const entityAssociations: ContractEntity[] = [];
        this._contractors?.map((item) => {
            entityAssociations.push(
                new ContractEntity({
                    contractRole: 'CONTRACTOR',
                    _contract: this,
                    _entity: item,
                })
            );
        });
        this._engineers?.map((item) => {
            entityAssociations.push(
                new ContractEntity({
                    contractRole: 'ENGINEER',
                    _contract: this,
                    _entity: item,
                })
            );
        });
        this._employers?.map((item) => {
            entityAssociations.push(
                new ContractEntity({
                    contractRole: 'EMPLOYER',
                    _contract: this,
                    _entity: item,
                })
            );
        });
        for (const association of entityAssociations) {
            console.log(
                `adding association ${association.contractRole} ${association._entity.name}`
            );
            await association.addInDb(externalConn, isPartOfTransaction);
        }
    }
    /** wywoływana w EditContractHandler */
    protected async editEntitiesAssociationsInDb(
        externalConn: mysql.PoolConnection,
        isPartOfTransaction?: boolean
    ) {
        await this.deleteEntitiesAssociationsFromDb(
            externalConn,
            isPartOfTransaction
        );
        await this.addEntitiesAssociationsInDb(
            externalConn,
            isPartOfTransaction
        );
    }

    async deleteEntitiesAssociationsFromDb(
        externalConn: mysql.PoolConnection,
        isPartOfTransaction?: boolean
    ) {
        console.log('deleting entities associations from db');
        const sql = `DELETE FROM Contracts_Entities WHERE ContractId =?`;
        return await ToolsDb.executePreparedStmt(
            sql,
            [this.id],
            this,
            externalConn,
            isPartOfTransaction
        );
    }
    protected async addContractRangesAssociationsInDb(
        externalConn: mysql.PoolConnection,
        isPartOfTransaction?: boolean
    ) {
        console.log('contractRanges', this._contractRangesPerContract);
        for (const rangeAssociation of this._contractRangesPerContract) {
            const associationData: ContractRangePerContractData = {
                _contract: this,
                _contractRange: rangeAssociation._contractRange,
                associationComment: rangeAssociation.associationComment,
            };
            const associationObject = new ContractRangeContract(
                associationData
            );
            await associationObject.addInDb(externalConn, isPartOfTransaction);
        }
    }

    protected async editContractRangesAssociationsInDb(
        externalConn: mysql.PoolConnection,
        isPartOfTransaction?: boolean
    ) {
        await this.deleteContractRangesContractsFromDb(
            externalConn,
            isPartOfTransaction
        );
        await this.addContractRangesAssociationsInDb(
            externalConn,
            isPartOfTransaction
        );
    }

    protected async deleteContractRangesContractsFromDb(
        externalConn: mysql.PoolConnection,
        isPartOfTransaction?: boolean
    ) {
        console.log('Deleting ContractRanges associations from db');
        const sql = `DELETE FROM ContractRangesContracts WHERE ContractId = ?`;
        return await ToolsDb.executePreparedStmt(
            sql,
            [this.id],
            this,
            externalConn,
            isPartOfTransaction
        );
    }

    async editFolder(auth: OAuth2Client) {
        //sytuacja normalna - folder itnieje
        if (this.gdFolderId) {
            try {
                await ToolsGd.getFileOrFolderMetaDataById(
                    auth,
                    this.gdFolderId
                );
            } catch (err) {
                console.log('folder not found, creating new one');
                return await this.createFolders(auth);
            }
            return await ToolsGd.updateFolder(auth, {
                name: this._folderName,
                id: this.gdFolderId,
            });
        }
        //kamień nie miał wcześniej typu albo coś poszło nie tak przy tworzeniu folderu
        else return await this.createFolders(auth);
    }

    async deleteFolder(auth: OAuth2Client) {
        ToolsGd.trashFileOrFolder(auth, <string>this.gdFolderId);
    }

    /** dodaje wiesz nagowka kontraktu */
    abstract deleteFromScrum(auth: OAuth2Client): Promise<void>;
    abstract addInScrum(auth: OAuth2Client): Promise<void>;
    abstract editInScrum(auth: OAuth2Client): Promise<boolean | undefined>;
    abstract setFolderName(): void;
    abstract shouldBeInScrum(): Promise<boolean>;
    abstract isUniquePerProject(): Promise<boolean>;
    protected abstract makeNotUniqueErrorMessage(): string;
}
