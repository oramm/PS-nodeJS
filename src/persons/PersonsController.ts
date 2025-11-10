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

    static async addNewPerson(personData: {
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
        const instance = this.getInstance();
        const person = new Person(personData);
        if (!person._entity?.id)
            throw new Error('Person must be associated with an entity.');

        delete person.systemRoleId;
        delete person.systemEmail;

        await instance.create(person);
        console.log(`Person ${person.name} ${person.surname} added in db`);
        return person;
    }

    static async updatePerson(
        personData: any,
        fieldsToUpdate: string[]
    ): Promise<Person> {
        const instance = this.getInstance();
        const person = new Person(personData);
        await instance.edit(person, undefined, undefined, fieldsToUpdate);
        console.log(`Person ${person.name} ${person.surname} updated in db`);
        return person;
    }

    static async deletePerson(
        personData: any
    ): Promise<{ id: number | undefined }> {
        const instance = this.getInstance();
        const person = new Person(personData);
        await instance.delete(person);
        console.log(`Person with id ${person.id} deleted from db`);
        return { id: person.id };
    }

    static async updateUser(
        userData: any,
        auth: OAuth2Client
    ): Promise<Person> {
        const instance = this.getInstance();
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
        await instance.edit(user, undefined, undefined, fieldsToUpdate);

        console.log(`User ${user.name} ${user.surname} updated in db`);
        return user;
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
        await instance.create(user);
        console.log(`User ${user.name} ${user.surname} added in db`);
        return user;
    }
}
