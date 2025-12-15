import Person from './Person';
import { UserData } from '../types/sessionTypes';
import PersonRepository, { PersonsSearchParams } from './PersonRepository';
import BaseController from '../controllers/BaseController';
import { OAuth2Client } from 'google-auth-library';

export type { PersonsSearchParams };

export default class PersonsController extends BaseController<
    Person,
    PersonRepository
> {
    private static instance: PersonsController;

    constructor() {
        super(new PersonRepository());
    }

    private static getInstance(): PersonsController {
        if (!this.instance) {
            this.instance = new PersonsController();
        }
        return this.instance;
    }

    static async find(
        searchParams: PersonsSearchParams[] = []
    ): Promise<Person[]> {
        const instance = this.getInstance();
        return instance.repository.find(searchParams);
    }

    /**
     * CREATE (DTO)
     * Router powinien wywoływać tę metodę.
     */
    static async addFromDto(personData: {
        name: string;
        surname: string;
        position?: string;
        email?: string;
        cellphone?: string;
        phone?: string;
        comment?: string;
        systemRoleId?: number;
        entityId?: number;
    }): Promise<Person> {
        const person = new Person(personData);
        if (!person._entity?.id)
            throw new Error('Person must be associated with an entity.');

        delete person.systemRoleId;
        delete person.systemEmail;

        return await this.add(person);
    }

    /**
     * CREATE
     * Dodaje osobę (tylko DB).
     */
    static async add(person: Person): Promise<Person> {
        const instance = this.getInstance();
        await instance.repository.addInDb(person);
        //await instance.create(person);
        console.log(`Person ${person.name} ${person.surname} added in db`);
        return person;
    }

    /**
     * UPDATE (DTO)
     * Router powinien wywoływać tę metodę.
     */
    static async editFromDto(
        personData: any,
        fieldsToUpdate: string[]
    ): Promise<Person> {
        const person = new Person(personData);
        return await this.edit(person, fieldsToUpdate);
    }

    /**
     * UPDATE
     * Edytuje osobę (tylko DB).
     */
    static async edit(
        person: Person,
        fieldsToUpdate: string[]
    ): Promise<Person> {
        const instance = this.getInstance();
        await instance.repository.editInDb(
            person,
            undefined,
            undefined,
            fieldsToUpdate
        );
        console.log(`Person ${person.name} ${person.surname} updated in db`);
        return person;
    }

    /**
     * DELETE (DTO)
     * Router powinien wywoływać tę metodę.
     */
    static async deleteFromDto(
        personData: any
    ): Promise<{ id: number | undefined }> {
        const person = new Person(personData);
        await this.delete(person);
        return { id: person.id };
    }

    /**
     * DELETE
     * Usuwa osobę (tylko DB).
     */
    static async delete(person: Person): Promise<void> {
        const instance = this.getInstance();
        await instance.repository.deleteFromDb(person);
        console.log(`Person with id ${person.id} deleted from db`);
    }

    /**
     * UPDATE USER (DTO)
     * Use-case: edycja użytkownika ENVI + aktualizacja ScrumSheet.
     * Router powinien wywoływać tę metodę.
     */
    static async editUserFromDto(userData: any): Promise<Person> {
        return await this.withAuth(async (instance, auth) => {
            const user = new Person(userData);

            const fieldsToUpdate = [
                'name',
                'surname',
                'position',
                'email',
                'cellphone',
                'phone',
                'comment',
                'systemRoleId',
                'systemEmail',
            ];

            await instance.repository.editInDb(
                user,
                undefined,
                undefined,
                fieldsToUpdate
            );
            console.log(`User ${user.name} ${user.surname} updated in db`);

            // TODO:
            // NOTE: ScrumSheet importuje PersonsController, więc używamy dynamic import
            // (legacy workaround do czasu osobnej analizy/refaktoryzacji modułu ScrumSheet).
            const [{ default: Planning }, { default: CurrentSprint }] =
                await Promise.all([
                    import('../ScrumSheet/Planning'),
                    import('../ScrumSheet/CurrentSprint'),
                ]);

            await Promise.all([
                Planning.refreshTimeAvailable(auth),
                CurrentSprint.makePersonTimePerTaskFormulas(auth),
            ]);

            return user;
        });
    }

    static async getPersonFromSessionUserData(
        userData: UserData
    ): Promise<Person> {
        const person = (await this.find([{ id: userData.enviId }]))[0];
        if (!person) throw new Error('No person found');
        return person;
    }

    static async getPersonBySystemEmail(systemEmail: string): Promise<Person> {
        return (
            await this.find([
                { systemEmail: systemEmail, showPrivateData: true },
            ])
        )[0];
    }

    static async getSystemRole(params: { id?: number; systemEmail?: string }) {
        const instance = this.getInstance();
        return instance.repository.getSystemRole(params);
    }

    static async addNewSystemUser(userData: {
        name: string;
        surname: string;
        position?: string;
        email?: string;
        cellphone?: string;
        phone?: string;
        comment?: string;
        systemRoleId: number;
        systemEmail: string;
        entityId: number;
    }): Promise<Person> {
        const instance = this.getInstance();
        const user = new Person(userData);
        if (!user.systemRoleId || !user.systemEmail || !user._entity?.id) {
            throw new Error(
                'User must have systemRoleId, systemEmail, and be associated with an entity.'
            );
        }

        await instance.repository.addInDb(user);
        console.log(`User ${user.name} ${user.surname} added in db`);
        return user;
    }
}
