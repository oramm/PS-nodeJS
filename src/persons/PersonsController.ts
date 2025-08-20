import Person from './Person';
import { UserData } from '../types/sessionTypes';
import PersonRepository, {
    PersonsSearchParams,
} from './PersonRepository';
import BaseController from '../controllers/BaseController';

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

    static async addNewPerson(personData:{
        name: string;
        surname: string;
        position?: string;
        email?: string;
        cellphone?: string;
        phone?: string;
        comment?: string;
        systemRoleId?: number;
        entityId?: number;
    }) : Promise<Person> {
        const instance = this.getInstance();
        const person = new Person(personData);
        await instance.create(person);
        console.log(`Person ${person.name} ${person.surname} added in db`);
        return person;
    }

    static async getPersonFromSessionUserData(userData: UserData): Promise<Person> {
        const person = (
            await this.find([{ id: userData.enviId }])
        )[0];
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
    
    static async getSystemRole(params: {
        id?: number;
        systemEmail?: string;
    }){
        const instance = this.getInstance();
        return instance.repository.getSystemRole(params);
    }
}
