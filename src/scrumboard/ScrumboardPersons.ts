import Person from '../persons/Person';
import PersonsController from '../persons/PersonsController';
import Setup from '../setup/Setup';

/**
 * Osoby uwzględniane w podsumowaniu godzin / planowaniu scrumboarda:
 * wszyscy pracownicy ENVI (ENVI_EMPLOYEE) + jeden manager z konfiguracji
 * (Setup.ScrumBoard.timesSummaryExtraPersonId). Odpowiednik
 * CurrentSprint.getTimesSummaryPersons z arkusza.
 */
export async function getScrumboardPersons(): Promise<Person[]> {
    const employees =
        (await PersonsController.find([{ systemRoleName: 'ENVI_EMPLOYEE' }])) ||
        [];
    const manager = (
        await PersonsController.find([
            {
                systemRoleName: 'ENVI_MANAGER',
                id: Setup.ScrumBoard.timesSummaryExtraPersonId,
            },
        ])
    )[0];
    const persons = manager ? [...employees, manager] : employees;
    // Sortowanie alfabetyczne (manager z configu wpleciony w listę, nie na końcu)
    return persons.sort((a, b) =>
        `${a.surname} ${a.name}`.localeCompare(`${b.surname} ${b.name}`, 'pl')
    );
}
