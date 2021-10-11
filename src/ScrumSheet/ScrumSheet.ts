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
        const persons = await ScrumSheet.scrumGetPersons();
        await this.Planning.refreshTimeAvailable(auth, persons);
        await this.CurrentSprint.makeTimesSummary(auth, persons);
        this.CurrentSprint.makepersonTimePerTaskFormulas(auth, persons);
        this.Data.synchronizePersonsInScrum(auth, persons);
    }
}