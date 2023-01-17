import PersonsController from "../persons/PersonsController";
import Planning from "./Planning";
import CurrentSprint from "./CurrentSprint";
import Data from "./Data";
import { OAuth2Client } from 'google-auth-library';
import ToolsSheets from "../tools/ToolsSheets";
import Setup from "../setup/Setup";

export default class ScrumSheet {
    static Planning = Planning;
    static CurrentSprint = CurrentSprint;
    static Data = Data
    static async scrumGetPersons() {
        return await PersonsController.getPersonsList({ systemRoleName: 'ENVI_EMPLOYEE' }) || [];
    }

    static async personsRefresh(auth: OAuth2Client) {
        try {
            console.group(`personRefresh start`);
            const persons = await ScrumSheet.scrumGetPersons();
            await this.Planning.refreshTimeAvailable(auth, persons);
            console.log('Planning Sheet refreshed');
            await this.CurrentSprint.makeTimesSummary(auth, persons);
            console.log('TImes summary refreshed');
            this.CurrentSprint.makePersonTimePerTaskFormulas(auth, persons);
            console.log('Person Time Per Task Formulas refreshed');
            this.Data.synchronizePersonsInScrum(auth, persons);
            console.log('Data sheet refreshed');
            console.log('Refresh completed');
            console.groupEnd();
        } catch (err) {
            console.log(err);
            throw (err);
        }
    }
}