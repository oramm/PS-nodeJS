import BusinessObject from '../BussinesObject';
import { EntityData } from '../types/types';
import type { GusSnapshot, GusStatus } from './gusBir/GusCompare';

export default class Entity extends BusinessObject implements EntityData {
    id?: number;
    name?: string;
    shortName?: string;
    address?: string;
    taxNumber?: string;
    /** GUS-1: REGON z rejestru GUS — 9 znaków (siedziba) albo 14 (jednostka lokalna). */
    regon?: string;
    /** GUS-1: numer KRS, 10 cyfr z wiodącymi zerami, dlatego tekst a nie liczba. */
    krs?: string;
    www?: string;
    email?: string;
    phone?: string;
    bankAccountNumber?: string | null;
    /**
     * GUS-2 — wynik ostatniego porównania z rejestrem GUS, migawka odpowiedzi i data
     * sprawdzenia. Te trzy pola ustawia WYŁĄCZNIE EntityRepository przy odczycie z bazy
     * i zapisuje wyłącznie EntityRepository.updateGusResult / applyGusSnapshot.
     *
     * Celowo NIE są brane z initParamObject: konstruktor obsługuje też dane z formularza,
     * a addInDb zapisuje każdy zdefiniowany atrybut. Gdyby konstruktor je przepisywał,
     * front mógłby ustawić dowolny status i migawkę przy zwykłym zapisie podmiotu — a to
     * łamie D-GUS-1 („GUS proponuje, człowiek przyjmuje", i tylko trasą /gus/accept).
     */
    gusStatus?: GusStatus;
    gusCheckedAt?: Date | null;
    gusSnapshot?: GusSnapshot | null;

    constructor(initParamObject: any) {
        super({ ...initParamObject, _dbTableName: 'Entities' });
        if (initParamObject) {
            this.id = initParamObject.id;
            if (initParamObject.name) this.name = initParamObject.name.trim();
            if (initParamObject.shortName) {
                const shortName = initParamObject.shortName.trim();
                if (shortName.length === 0)
                    throw new Error('shortName nie może być pusty');
                if (shortName.length > 15)
                    throw new Error(
                        'shortName nie może przekraczać 15 znaków'
                    );
                this.shortName = shortName;
            }
            this.address = initParamObject.address;
            // GUS-1: normalizacja NIP-u NIE dzieje się tutaj, tylko w
            // EntitiesController (normalizedTaxNumber). Import normalizeNip z
            // contracts/aqmSync/AqmSync zamknąłby cykl Entity -> AqmSync ->
            // ContractOur -> Entity, który wywraca `yarn check:cycles`.
            if (initParamObject.taxNumber)
                this.taxNumber = initParamObject.taxNumber;
            if (initParamObject.regon) this.regon = initParamObject.regon;
            if (initParamObject.krs) this.krs = initParamObject.krs;
            this.www = initParamObject.www;
            this.email = initParamObject.email;
            this.phone = initParamObject.phone;
            this.bankAccountNumber = initParamObject.bankAccountNumber ?? null;
        }
    }
}
