import BusinessObject from '../../BussinesObject';
import { CityData } from '../../types/types';
import CitiesController from './CitiesController';

export default class City extends BusinessObject implements CityData {
    id?: number;
    name: string;
    code?: string;

    constructor(initParamObject: CityData) {
        super({ ...initParamObject, _dbTableName: 'Cities' });
        this.name = initParamObject.name;
        this.code = initParamObject.code;
    }

    async addNewController() {
        this.code = await this.generateCityCode();
        await this.addInDb();
        console.log(`City ${this.name} ${this.code} added in db`);
    }

    async generateCityCode(): Promise<string> {
        const cityName = this.name;
        const normalizedCityName = this.normalizeCityName(cityName);

        const existingCities = await CitiesController.getCitiesList([]);
        const existingCodes = new Set(
            existingCities
                .map((city) => city.code)
                .filter((code) => code !== undefined) as string[]
        );

        return this.generateUniqueCode(normalizedCityName, existingCodes);
    }

    private async generateUniqueCode(
        normalizedCityName: string,
        existingCodes: Set<string>,
        attempts = 0
    ): Promise<string> {
        const maxAttempts = 100;

        for (let i = 0; i < maxAttempts; i++) {
            const code = this.generateCodeFromName(normalizedCityName, i);
            if (!existingCodes.has(code)) {
                existingCodes.add(code);
                console.log(
                    `Generated unique code for city: ${this.name} in ${attempts} attempts`
                );
                return code;
            }
        }

        console.error(
            `Failed to generate unique code after ${maxAttempts} attempts for city: ${this.name}`
        );
        throw new Error('Cannot generate unique code for the city name.');
    }

    private generateCodeFromName(name: string, attempt: number): string {
        let code = name[0]; // Zawsze pierwsza litera

        const letters = name.slice(1).split('');
        for (let i = 0; i < 2; i++) {
            const index = (attempt + i) % letters.length;
            code += letters[index] || 'X';
        }

        return code;
    }
    private normalizeCityName(cityName: string): string {
        const polishChars: { [key: string]: string } = {
            Ą: 'A',
            Ć: 'C',
            Ę: 'E',
            Ł: 'L',
            Ń: 'N',
            Ó: 'O',
            Ś: 'S',
            Ź: 'Z',
            Ż: 'Z',
            ą: 'a',
            ć: 'c',
            ę: 'e',
            ł: 'l',
            ń: 'n',
            ó: 'o',
            ś: 's',
            ź: 'z',
            ż: 'z',
        };

        return cityName
            .split('')
            .map((char) => polishChars[char] || char)
            .filter((char) => /^[A-Z]$/i.test(char))
            .join('')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase();
    }
}
