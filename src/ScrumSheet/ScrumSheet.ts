import PersonsController from '../persons/PersonsController';
import Planning from './Planning';
import CurrentSprint from './CurrentSprint';
import Data from './Data';
import { OAuth2Client } from 'google-auth-library';
import CurrentSprintValidator from './CurrentSprintValidator';

export default class ScrumSheet {
    static Planning = Planning;
    static CurrentSprint = CurrentSprint;
    static Data = Data;
    static async scrumGetPersons(
        systemRoleNames: string[] = ['ENVI_EMPLOYEE']
    ) {
        const orConditions = systemRoleNames.map((systemRoleName) => ({
            systemRoleName,
        }));
        return (await PersonsController.find(orConditions)) || [];
    }

    static async personsRefresh(auth: OAuth2Client) {
        try {
            console.group(`personRefresh start`);
            await CurrentSprintValidator.checkColumns(auth);
            const employees = await ScrumSheet.scrumGetPersons([
                'ENVI_EMPLOYEE',
            ]);
            const managersAndEmployees = await ScrumSheet.scrumGetPersons([
                'ENVI_EMPLOYEE',
                'ENVI_MANAGER',
            ]);
            await this.Planning.refreshTimeAvailable(
                auth,
                managersAndEmployees
            );
            console.log('Planning Sheet refreshed');
            await this.CurrentSprint.makeTimesSummary(
                auth,
                managersAndEmployees
            );
            console.log('Times summary refreshed');
            await this.CurrentSprint.makePersonTimePerTaskFormulas(
                auth,
                managersAndEmployees
            );
            console.log('Person Time Per Task Formulas refreshed');
            await this.Data.synchronizePersonsInScrum(
                auth,
                managersAndEmployees
            );
            console.log('Data sheet refreshed');
            console.log('Refresh completed');
            console.groupEnd();
        } catch (err) {
            console.log(err);
            throw err;
        }
    }
}
