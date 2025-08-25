import mysql from 'mysql2/promise';
import { ApplicationCallData } from '../../../types/types';
import ToolsGd from '../../../tools/ToolsGd';
import ApplicationCall from './ApplicationCall';
import ApplicationCallRepository, { ApplicationCallSearchParams } from './ApplicationCallRepository';
import BaseController from '../../../controllers/BaseController';
import { OAuth2Client } from 'google-auth-library';
import ApplicationCallGdController from './ApplicationCallGdController';

export type { ApplicationCallSearchParams };

export default class ApplicationCallsController extends BaseController<
    ApplicationCall, 
    ApplicationCallRepository 
    > {
        private static instance: ApplicationCallsController;

        constructor() {
            super(new ApplicationCallRepository);
        }
        private static getInstance(): ApplicationCallsController {
            if (!this.instance) {
                this.instance = new ApplicationCallsController();
            }
            return this.instance;
        }

        static async addNewApplicationCall(
            CallData: ApplicationCallData, 
            auth: OAuth2Client
        ) : Promise<ApplicationCall> {
            const instance = this.getInstance();
            const item = new ApplicationCall(CallData);
            const gdController = new ApplicationCallGdController();
            try {
                console.group('Creating ApplicationCall');
                const gdFolder = await gdController
                .createFolder(auth, item)
                .catch((err) => {
                    throw new Error(`ApplicationCall folder creation error: ${err}`);
                });
                item.setGdFolderIdAndUrl(gdFolder.id as string);
                console.log(`ApplicationCall folder created`);
                await instance.create(item);
                console.log(`ApplicationCall added to db`);
                console.groupEnd();
                return item;
            }
            catch (err) {
                console.error('ApplicationCall creation error');
                if (item.gdFolderId) {
                    await gdController.deleteFromGd(auth, item.gdFolderId).catch(cleanupErr => console.error('Cleanup error', cleanupErr));
                }
                throw err;
            }

        }
     

        static async find(
            searchParams: ApplicationCallSearchParams[] = []
        ): Promise<ApplicationCall[]> {
            const instance = this.getInstance();
            return await instance.repository.find(searchParams);
        }
       
    static async updateApplicationCall(        
        applicationCallData: ApplicationCallData, 
        fieldstoUpdate: string[],
        auth: OAuth2Client
    ) : Promise<ApplicationCall> {
        const instance = this.getInstance();
        const item = new ApplicationCall(applicationCallData);
        const gdController = new ApplicationCallGdController();
        try {
            console.group('Editing ApplicationCall');
            await ToolsGd.updateFolder(auth, {
                name : gdController.makeFolderName(item),
                id: item.gdFolderId,
            });
            console.log('ApplicationCall folder edited');
            await instance.edit(item, undefined, undefined, fieldstoUpdate);
            console.log(`ApplicationCall edited in db`);
            console.groupEnd();
            return item;
        }
        catch (err) {
            console.error('ApplicationCall edit error');
            throw err;
        }
    }

    static async deleteApplicationCall(
        ApplicationCallData: ApplicationCallData,
        auth: OAuth2Client,
    ): Promise<void> {
        const instance = this.getInstance();
        const gdController = new ApplicationCallGdController();
        await gdController.deleteFromGd(auth, ApplicationCallData.gdFolderId);
        const applicationCall = new ApplicationCall(ApplicationCallData);
        await instance.delete(applicationCall);
        console.log(`Contract range ${applicationCall.focusAreaId} deleted from db`);
    }

    static makeSearchTextCondition(searchText: string | undefined) {
        if (!searchText) return '1';
        searchText = searchText.toString();
        const words = searchText.split(' ');
        const conditions = words.map((word) =>
            mysql.format(
                `(ApplicationCalls.Description LIKE ? 
                    OR ApplicationCalls.Url LIKE ?)`,
                [`%${word}%`, `%${word}%`]
            )
        );

        const searchTextCondition = conditions.join(' AND ');
        return searchTextCondition;
    }

    static makeAndConditions(searchParams: ApplicationCallSearchParams) {
        const conditions: string[] = [];
        const searchTextCondition = this.makeSearchTextCondition(
            searchParams.searchText
        );
        if (searchTextCondition !== '1') {
            conditions.push(searchTextCondition);
        }
        if (searchParams._financialAidProgramme?.id) {
            conditions.push(
                mysql.format(`FocusAreas.FinancialAidProgrammeId = ?`, [
                    searchParams._financialAidProgramme.id,
                ])
            );
        }

        // Prepare an array to collect all focus area IDs.
        let focusAreaIds: number[] = [];

        // Check if there's a direct ID or a single _focusArea object.
        if (searchParams.focusAreaId) {
            focusAreaIds.push(searchParams.focusAreaId);
        } else if (
            !Array.isArray(searchParams._focusArea) &&
            searchParams._focusArea?.id
        ) {
            focusAreaIds.push(searchParams._focusArea?.id);
        }
        // If _focusArea is an array, add all IDs from it.
        else if (Array.isArray(searchParams._focusArea)) {
            focusAreaIds = focusAreaIds.concat(
                searchParams._focusArea.map((fa) => fa.id as number)
            );
        }

        // Create SQL condition using the IN clause if there are any IDs collected.
        if (focusAreaIds.length) {
            const placeholders = focusAreaIds.map(() => '?').join(', ');
            const focusAreaCondition = mysql.format(
                `ApplicationCalls.FocusAreaId IN (${placeholders})`,
                focusAreaIds
            );
            conditions.push(focusAreaCondition);
        }
        if (searchParams.statuses?.length) {
            const statusPlaceholders = searchParams.statuses
                .map(() => '?')
                .join(',');
            conditions.push(
                mysql.format(
                    `ApplicationCalls.Status IN (${statusPlaceholders})`,
                    searchParams.statuses
                )
            );
        }

        if (searchParams.startDateFrom) {
            conditions.push(
                mysql.format(`ApplicationCalls.StartDate >= ?`, [
                    searchParams.startDateFrom,
                ])
            );
        }

        if (searchParams.startDateTo) {
            conditions.push(
                mysql.format(`ApplicationCalls.StartDate <= ?`, [
                    searchParams.startDateTo,
                ])
            );
        }

        if (searchParams.endDateFrom) {
            conditions.push(
                mysql.format(`ApplicationCalls.EndDate >= ?`, [
                    searchParams.endDateFrom,
                ])
            );
        }

        if (searchParams.endDateTo) {
            conditions.push(
                mysql.format(`ApplicationCalls.EndDate <= ?`, [
                    searchParams.endDateTo,
                ])
            );
        }

        return conditions.length ? conditions.join(' AND ') : '1';
    }
}
