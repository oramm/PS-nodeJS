import Person from '../persons/Person';
import PersonsController from '../persons/PersonsController';
import StaffMemberRepository from '../staff/StaffMemberRepository';

/**
 * Osoby uwzględniane w scrumboardzie (podsumowanie godzin / planowanie):
 * personel z flagą IsInScrum w tabeli StaffMembers. Zastępuje dawny hardkod
 * "wszyscy ENVI_EMPLOYEE + jeden manager z configu (386)".
 */
export async function getScrumboardPersons(): Promise<Person[]> {
    const personIds = await StaffMemberRepository.getScrumPersonIds();
    if (personIds.length === 0) return [];
    const persons = await PersonsController.find(personIds.map((id) => ({ id })));
    return persons.sort((a, b) =>
        `${a.surname} ${a.name}`.localeCompare(`${b.surname} ${b.name}`, 'pl')
    );
}
