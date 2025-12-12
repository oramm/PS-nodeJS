import ToolsDate from '../tools/ToolsDate';
import Entity from '../entities/Entity';
import ProjectEntity from './ProjectEntity';
import BusinessObject from '../BussinesObject';
import ToolsGd from '../tools/ToolsGd';
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import Setup from '../setup/Setup';
import { EntityData, ProjectData } from '../types/types';

export default class Project extends BusinessObject implements ProjectData {
    id?: number;
    ourId: string;
    name: string;
    alias: string;
    startDate: string | undefined;
    endDate: string | undefined;
    status: string;
    comment: string;
    investorId?: number;
    _gdFolderUrl: string | undefined;
    lettersGdFolderId?: string;
    googleGroupId: any;
    _googleGroupUrl: string | undefined;
    googleCalendarId: any;
    _googleCalendarUrl: any;
    _ourId_Alias: string;
    financialComment?: string;
    totalValue?: string | number;
    qualifiedValue?: string | number;
    dotationValue?: string | number;
    gdFolderId: string | undefined;
    _lastUpdated?: string;
    _engineers: EntityData[];
    _employers?: EntityData[];

    constructor(initParamObject: any) {
        super({ ...initParamObject, _dbTableName: 'Projects' });
        this.id = initParamObject.id;
        this.ourId = initParamObject.ourId;
        this.alias = initParamObject.alias;
        this.startDate = ToolsDate.dateJsToSql(initParamObject.startDate);
        this.endDate = ToolsDate.dateJsToSql(initParamObject.endDate);
        this.name = initParamObject.name;
        this.status = initParamObject.status;
        this.comment = initParamObject.comment;
        if (initParamObject.financialComment)
            this.financialComment = initParamObject.financialComment;
        if (initParamObject.investorId)
            this.investorId = initParamObject.investorId;
        if (initParamObject.totalValue)
            this.totalValue = initParamObject.totalValue;
        if (initParamObject.qualifiedValue)
            this.qualifiedValue = initParamObject.qualifiedValue;
        if (initParamObject.dotationValue)
            this.dotationValue = initParamObject.dotationValue;

        if (initParamObject.gdFolderId) {
            this.gdFolderId = initParamObject.gdFolderId;
            this._gdFolderUrl = ToolsGd.createGdFolderUrl(
                initParamObject.gdFolderId
            );
        }
        this.lettersGdFolderId = initParamObject.lettersGdFolderId;

        if (initParamObject.googleGroupId) {
            this.googleGroupId = initParamObject.googleGroupId;
            this._googleGroupUrl =
                'https://groups.google.com/forum/?hl=pl#!forum/' +
                this.googleGroupId.replace(/\./gi, '');
        }
        if (initParamObject.googleCalendarId) {
            this.googleCalendarId = initParamObject.googleCalendarId;
            this._googleCalendarUrl = this.makeCalendarUrl();
        }
        this._ourId_Alias = this.ourId;
        if (this.alias) this._ourId_Alias += ' ' + this.alias;
        this._lastUpdated = initParamObject._lastUpdated;
        this.gdFolderName();

        this._employers = initParamObject._employers
            ? initParamObject._employers
            : [];
        this._engineers = initParamObject._engineers
            ? initParamObject._engineers
            : [];
        if (this._engineers)
            this.setProjectEngineersAssociations(this._engineers);
    }

    gdFolderName() {
        return this._ourId_Alias;
    }

    setGdFolderIdAndUrl(gdFolderId: string) {
        this.gdFolderId = gdFolderId;
        this._gdFolderUrl = ToolsGd.createGdFolderUrl(gdFolderId);
    }

    async createProjectFolder(auth: OAuth2Client) {
        const folder = await ToolsGd.setFolder(auth, {
            parentId: Setup.Gd.rootFolderId,
            name: this.gdFolderName(),
        });
        this.setGdFolderIdAndUrl(folder.id as string);
        await this.createProjectLettersFolder(auth);
        return folder;
    }

    async createProjectLettersFolder(auth: OAuth2Client) {
        if (!this.gdFolderId) throw new Error('Project folder id not set');
        const folder = await ToolsGd.setFolder(auth, {
            parentId: this.gdFolderId,
            name: 'Korespondencja',
        });
        this.lettersGdFolderId = folder.id as string;
        return folder;
    }

    async editProjectFolder(auth: OAuth2Client) {
        return await ToolsGd.updateFolder(auth, {
            name: this.gdFolderName(),
            id: this.gdFolderId,
        });
    }

    async deleteProjectFolder(auth: OAuth2Client) {
        const drive = google.drive({ version: 'v3', auth });
        const filesSchema = await drive.files.get({
            fileId: this.gdFolderId,
            fields: 'id, ownedByMe',
        });
        if (filesSchema.data.ownedByMe)
            await ToolsGd.trashFile(auth, filesSchema.data.id as string);
        else
            await ToolsGd.updateFolder(auth, {
                id: this.gdFolderId,
                name: `${this.gdFolderName()} - USUŃ`,
            });
    }

    makeCalendarUrl(): string {
        return (
            'https://calendar.google.com/calendar/embed?src=' +
            this.googleCalendarId +
            '&ctz=Europe%2FWarsaw'
        );
    }

    setProjectEngineersAssociations(engineers?: EntityData[]) {
        this._engineers = engineers ?? [];
        if (this._engineers.length === 0)
            this._engineers.push(
                new Entity({
                    id: 1,
                    name: 'ENVI',
                    address: 'ul. Jana Brzechwy 3, 49-305 Brzeg',
                    taxNumber: '747-191-75-75',
                })
            );
    }
    /**
     * używany do przetworzenia wyniku z Db
     */
    setProjectEntityAssociations(
        allProjectEntityAssociations: ProjectEntity[]
    ) {
        this._employers = allProjectEntityAssociations
            .filter(
                (item: any) =>
                    item._project.id === this.id &&
                    item.projectRole == 'EMPLOYER'
            )
            .map((item: any) => item._entity);

        const engineers = allProjectEntityAssociations
            .filter(
                (item: any) =>
                    item._project.id === this.id &&
                    item.projectRole == 'ENGINEER'
            )
            .map((item: any) => item._entity);

        this.setProjectEngineersAssociations(engineers);
    }
}
