import BaseController from '../../controllers/BaseController';
import { BadRequestError } from '../../persons/projectAssignments/ProjectScopeGuard';
import Car from './Car';
import CarRepository, { CarsSearchParams } from './CarRepository';
import CarValidator from './CarValidator';

/**
 * Controller słownika samochodów.
 * Przepływ: Router → Controller → (Validator) → Repository → Model
 */
export default class CarsController extends BaseController<Car, CarRepository> {
    private static instance: CarsController;

    private constructor() {
        super(new CarRepository());
    }

    private static getInstance(): CarsController {
        if (!this.instance) {
            this.instance = new CarsController();
        }
        return this.instance;
    }

    static async find(orConditions: CarsSearchParams[] = [{}]): Promise<Car[]> {
        const instance = this.getInstance();
        return await instance.repository.find(orConditions);
    }

    static async addFromDto(dto: any): Promise<Car> {
        const payload = CarValidator.validateCreatePayload(dto);
        return await this.add(new Car(payload));
    }

    static async add(item: Car): Promise<Car> {
        const instance = this.getInstance();
        await instance.repository.addInDb(item);
        return item;
    }

    static async editFromDto(dto: any): Promise<Car> {
        const payload = CarValidator.validateUpdatePayload(dto);
        return await this.edit(new Car(payload));
    }

    static async edit(item: Car): Promise<Car> {
        const instance = this.getInstance();
        await instance.repository.editInDb(item);
        return item;
    }

    static async deleteFromDto(dto: any): Promise<Car> {
        const id = CarValidator.requireId(dto?.id);
        const instance = this.getInstance();
        const [existing] = await instance.repository.find([{ id }]);
        if (!existing)
            throw new BadRequestError('Samochód o podanym numerze nie istnieje.');
        await instance.repository.deleteFromDb(existing);
        return existing;
    }
}

export type { CarsSearchParams } from './CarRepository';
