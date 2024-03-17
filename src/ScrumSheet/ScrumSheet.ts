import PersonsController from '../persons/PersonsController';
import Planning from './Planning';
import CurrentSprint from './CurrentSprint';
import Data from './Data';
import { OAuth2Client } from 'google-auth-library';
import ToolsSheets from '../tools/ToolsSheets';
import Setup from '../setup/Setup';

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
        return (await PersonsController.getPersonsList(orConditions)) || [];
    }

    static async personsRefresh(auth: OAuth2Client) {
        try {
            console.group(`personRefresh start`);
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
            console.log('TImes summary refreshed');
            this.CurrentSprint.makePersonTimePerTaskFormulas(
                auth,
                managersAndEmployees
            );
            console.log('Person Time Per Task Formulas refreshed');
            this.Data.synchronizePersonsInScrum(auth, managersAndEmployees);
            console.log('Data sheet refreshed');
            console.log('Refresh completed');
            console.groupEnd();
        } catch (err) {
            console.log(err);
            throw err;
        }
    }
}
