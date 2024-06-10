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

        // Wykonanie jednego zapytania do bazy danych na początku
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
        let code = normalizedCityName[0]; // Zawsze pierwsza litera

        for (let i = 1; i < normalizedCityName.length && code.length < 3; i++) {
            const char = normalizedCityName[i];
            if (/^[A-Z]$/.test(char)) {
                code += char;
            }
        }

        while (code.length < 3) {
            code += 'X';
        }

        let uniqueCode = code;

        const suffixGenerator =
            this.generateSuffixesFromName(normalizedCityName);
        uniqueCode = code.slice(0, 1) + suffixGenerator.next().value;

        if (existingCodes.has(uniqueCode)) {
            if (attempts >= 100) {
                console.error(
                    `Failed to generate unique code after ${attempts} attempts for city: ${this.name}`
                );
                throw new Error(
                    'Cannot generate unique code for the city name.'
                );
            }
            return this.generateUniqueCode(
                normalizedCityName,
                existingCodes,
                attempts + 1
            );
        }

        existingCodes.add(uniqueCode);
        console.log(
            `Generated unique code for city: ${this.name} in ${attempts} attempts`
        );
        return uniqueCode;
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
            .filter((char) => /^[A-Z]$/i.test(char)) // Ignorowanie spacji i znaków nieliterowych
            .join('')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase();
    }

    private *generateSuffixesFromName(name: string) {
        const uniqueLetters = [...new Set(name)].join('');
        for (let i = 1; i < uniqueLetters.length; i++) {
            for (let j = 1; j < uniqueLetters.length; j++) {
                if (i !== j) {
                    yield uniqueLetters[i] + uniqueLetters[j];
                }
            }
        }
        yield* this.generateSuffixes();
    }

    private *generateSuffixes() {
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        for (let i = 0; i < alphabet.length; i++) {
            for (let j = 0; j < alphabet.length; j++) {
                yield alphabet[i] + alphabet[j];
            }
        }
    }
}
