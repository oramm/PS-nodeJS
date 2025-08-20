import City from './City';
import BaseController from '../../controllers/BaseController';
import CityRepository, {
    CitiesSearchParams,
} from './CityRepository';

// Eksportuj typ dla kompatybilności wstecznej
export type { CitiesSearchParams };

export default class CitiesController extends BaseController<
    City,
    CityRepository
> {
    private static instance: CitiesController;

    constructor() {
        super(new CityRepository());
    }

    // Singleton pattern dla zachowania kompatybilności ze statycznymi metodami
    private static getInstance(): CitiesController {
        if (!this.instance) {
            this.instance = new CitiesController();
        }
        return this.instance;
    }

    /**
     * NOWE API - Rekomendowany sposób dodawania miast
     */
    static async addNewCity(cityData: {
        name: string;
        code?: string;
    }): Promise<City> {
        const instance = this.getInstance();
        const city = new City(cityData);

        // Generuj kod jeśli nie podano
        if (!city.code) {
            const repository = instance.repository;
            const existingCodes = await repository.findAllCodes();
            const normalizedName = City.normalizeCityName(city.name);
            city.code = City.generateUniqueCode(normalizedName, existingCodes);
        }

        await instance.create(city);
        console.log(`City ${city.name} ${city.code} added in db`);
        return city;
    }

    /**
     * NOWE API - Rekomendowany sposób pobierania listy miast
     */
    static async find(
        searchParams: CitiesSearchParams[] = []
    ): Promise<City[]> {
        const instance = this.getInstance();
        return await instance.repository.find(searchParams);
    }

    /**
     * NOWE API - Rekomendowany sposób aktualizacji miasta
     */
    static async updateCity(
        cityData: City, 
        fieldsToUpdate?: string[]
    ): Promise<City> {
        const instance = this.getInstance();
        const city = new City(cityData);
        await instance.edit(city, undefined, false, fieldsToUpdate);
        console.log(`City ${city.name} ${city.code} updated in db`);
        return city;
    }

    /**
     * NOWE API - Rekomendowany sposób usuwania miasta
     */
    static async deleteCity(
        cityData: City
    ): Promise<void> {
        const instance = this.getInstance();
        const city = new City(cityData);
        await instance.delete(city);
        console.log(`City ${city.name} ${city.code} deleted from db`);
    }
}
