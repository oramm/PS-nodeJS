import PersonsController from '../persons/PersonsController';
import Planning from './Planning';
import CurrentSprint from './CurrentSprint';
import Data from './Data';
import { OAuth2Client } from 'google-auth-library';
import CurrentSprintValidator from './CurrentSprintValidator';
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
        return (await PersonsController.find(orConditions)) || [];
    }

    static async personsRefresh(auth: OAuth2Client) {
        try {
            console.group(`personRefresh start`);
            const persons = await CurrentSprint.getTimesSummaryPersons();

            // "aktualny sprint" i "planowanie" tylko przy włączonej fladze
            if (Setup.scrumSheetSyncEnabled) {
                await CurrentSprintValidator.checkColumns(auth);
                await this.Planning.refreshTimeAvailable(auth, persons);
                console.log('Planning Sheet refreshed');
                await this.CurrentSprint.makeTimesSummary(auth, persons);
                console.log('Times summary refreshed');
                await this.CurrentSprint.makePersonTimePerTaskFormulas(
                    auth,
                    persons
                );
                console.log('Person Time Per Task Formulas refreshed');
            }

            // arkusz "dane" działa zawsze
            await this.Data.synchronizePersonsInScrum(auth, persons);
            console.log('Data sheet refreshed');
            console.log('Refresh completed');
            console.groupEnd();
        } catch (err) {
            console.log(err);
            throw err;
        }
    }
}
