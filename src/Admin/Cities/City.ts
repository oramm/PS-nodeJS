import BusinessObject from '../../BussinesObject';
import { CityData } from '../../types/types';

export default class City extends BusinessObject implements CityData {
    id?: number;
    name: string;
    code?: string;

    constructor(initParamObject: CityData) {
        super({ ...initParamObject, _dbTableName: 'Cities' });
        this.name = initParamObject.name;
        this.code = initParamObject.code;
    }

    /**
     * @deprecated Przekaż existingCodes jako parametr zamiast pobierać je w metodzie
     */
    async generateCityCode(existingCodes?: Set<string>): Promise<string> {
        console.warn(
            'generateCityCode() is deprecated. Use static methods instead.'
        );
        const cityName = this.name;
        const normalizedCityName = City.normalizeCityName(cityName);

        // Jeśli nie przekazano kodów, zwróć błąd
        if (!existingCodes) {
            throw new Error('ExistingCodes parameter is required');
        }

        return City.generateUniqueCode(normalizedCityName, existingCodes);
    }

    /**
     * Normalizuje nazwę miasta (usuwa polskie znaki, zostawia tylko litery)
     */
    static normalizeCityName(cityName: string): string {
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

    /**
     * Generuje unikalny kod dla miasta
     */
    static generateUniqueCode(
        normalizedCityName: string,
        existingCodes: Set<string>
    ): string {
        const maxAttempts = 100;

        for (let i = 0; i < maxAttempts; i++) {
            const code = this.generateCodeFromName(normalizedCityName, i);
            if (!existingCodes.has(code)) {
                existingCodes.add(code);
                return code;
            }
        }

        throw new Error('Cannot generate unique code for the city name.');
    }

    /**
     * Generuje kod z nazwy miasta
     */
    static generateCodeFromName(name: string, attempt: number): string {
        let code = name[0]; // Zawsze pierwsza litera

        const letters = name.slice(1).split('');
        for (let i = 0; i < 2; i++) {
            const index = (attempt + i) % letters.length;
            code += letters[index] || 'X';
        }

        return code;
    }
}
