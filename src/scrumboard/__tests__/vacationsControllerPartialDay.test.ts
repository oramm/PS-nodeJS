/// <reference types="jest" />
/**
 * Kontroler urlopów przy nieobecności na część dnia: rachunek puli, flaga typu
 * i blokada dwóch nieobecności w tym samym terminie.
 *
 * Bazy nie dotykamy - trzy repozytoria podmieniamy fabrykami, żeby ts-jest nie
 * kompilował głębokiego grafu i żeby test mierzył LOGIKĘ, nie SQL.
 */
jest.mock('googleapis', () => ({ google: { sheets: jest.fn(), drive: jest.fn() } }));
jest.mock('../../setup/Sessions/ToolsGapi', () => ({
    __esModule: true,
    default: {},
    oAuthClient: {},
}));

const mockState: {
    absences: any[];
    types: any[];
    entitlements: any[];
    inserted: any;
    updated: any;
} = {
    absences: [],
    types: [],
    entitlements: [],
    inserted: null,
    updated: null,
};

jest.mock('../ScrumboardPersons', () => ({
    getScrumboardPersons: jest.fn(async () => [
        { id: 1, name: 'Jan', surname: 'Testowy', _alias: 'JT' },
    ]),
}));

jest.mock('../vacations/ScrumboardAbsenceRepository', () => ({
    __esModule: true,
    default: class {
        async find(params: any = {}) {
            return mockState.absences.filter(
                (a: any) =>
                    (!params.personIds || params.personIds.includes(a.personId)) &&
                    (!params.rangeEnd || a.dateFrom <= params.rangeEnd) &&
                    (!params.rangeStart || a.dateTo >= params.rangeStart)
            );
        }
        async findById(id: number) {
            return mockState.absences.find((a: any) => a.id === id);
        }
        async insert(absence: any) {
            mockState.inserted = absence;
            return 99;
        }
        async update(absence: any) {
            mockState.updated = absence;
        }
        async deleteById() {}
    },
}));

jest.mock('../vacations/ScrumboardAbsenceTypeRepository', () => ({
    __esModule: true,
    default: class {
        async find() {
            return mockState.types;
        }
    },
}));

jest.mock('../vacations/ScrumboardVacationEntitlementRepository', () => ({
    __esModule: true,
    default: class {
        async find() {
            return mockState.entitlements;
        }
    },
}));

import { beforeEach, describe, expect, it } from '@jest/globals';
import ScrumboardVacationsController from '../vacations/ScrumboardVacationsController';
import { BadRequestError } from '../../persons/projectAssignments/ProjectScopeGuard';

const OPIEKA = {
    id: 4,
    name: 'Opieka',
    color: '#20c997',
    countsAgainstLimit: false,
    countsAsCare: true,
    countsAsHoliday: false,
    allowsPartialDay: true,
};
const L4 = {
    id: 5,
    name: 'L4',
    color: '#dc3545',
    countsAgainstLimit: false,
    countsAsCare: false,
    countsAsHoliday: false,
    allowsPartialDay: false,
};
const WYPOCZYNKOWY = {
    id: 1,
    name: 'Wypoczynkowy',
    color: '#0d6efd',
    countsAgainstLimit: true,
    countsAsCare: false,
    countsAsHoliday: false,
    allowsPartialDay: true,
};

/** Wiersz nieobecności taki, jaki oddaje repozytorium (z polami z JOINa). */
function absenceRow(over: Partial<Record<string, any>> = {}) {
    return {
        id: 1,
        personId: 1,
        typeId: OPIEKA.id,
        dateFrom: '2026-09-18',
        dateTo: '2026-09-18',
        startTime: null,
        endTime: null,
        workingDaysCount: 1,
        note: null,
        _typeName: 'Opieka',
        _countsAgainstLimit: false,
        _countsAsCare: true,
        _countsAsHoliday: false,
        ...over,
    };
}

const CALY_DZIEN = { startTime: null, endTime: null, note: null };

beforeEach(() => {
    mockState.absences = [];
    mockState.types = [WYPOCZYNKOWY, OPIEKA, L4];
    mockState.entitlements = [
        {
            personId: 1,
            year: 2026,
            limitDays: 26,
            carryoverDays: 0,
            careDays: 2,
            holidayDays: 1,
        },
    ];
    mockState.inserted = null;
    mockState.updated = null;
});

describe('cztery godziny opieki to pół dnia', () => {
    it('zapisana liczba dni to 0,5', async () => {
        await ScrumboardVacationsController.addAbsence({
            personId: 1,
            typeId: OPIEKA.id,
            dateFrom: '2026-09-18',
            dateTo: '2026-09-18',
            startTime: '08:00',
            endTime: '12:00',
            note: null,
        });
        expect(mockState.inserted.workingDaysCount).toBe(0.5);
        expect(mockState.inserted.startTime).toBe('08:00');
        expect(mockState.inserted.endTime).toBe('12:00');
    });

    it('po 4 h opieki z puli 2 dni saldo pokazuje 1,5', async () => {
        mockState.absences = [
            absenceRow({ startTime: '08:00', endTime: '12:00', workingDaysCount: 0.5 }),
        ];
        const data = await ScrumboardVacationsController.getYearData(2026);
        expect(data.rows[0].careUsedDays).toBe(0.5);
        expect(data.rows[0].careRemainingDays).toBe(1.5);
    });

    it('cały dzień liczy się tak jak przed zmianą - kontrola negatywna', async () => {
        await ScrumboardVacationsController.addAbsence({
            personId: 1,
            typeId: WYPOCZYNKOWY.id,
            dateFrom: '2026-09-14', // pon
            dateTo: '2026-09-16', // śr
            ...CALY_DZIEN,
        });
        expect(mockState.inserted.workingDaysCount).toBe(3);
        expect(mockState.inserted.startTime).toBeNull();
    });
});

describe('pula nie odrzuca wniosku mieszczącego się co do minuty', () => {
    it('4 h opieki przy puli 0,5 dnia i zerowym zużyciu przechodzi', async () => {
        mockState.entitlements = [
            { personId: 1, year: 2026, limitDays: 26, carryoverDays: 0, careDays: 0.5, holidayDays: 0 },
        ];
        await expect(
            ScrumboardVacationsController.addAbsence({
                personId: 1,
                typeId: OPIEKA.id,
                dateFrom: '2026-09-18',
                dateTo: '2026-09-18',
                startTime: '08:00',
                endTime: '12:00',
                note: null,
            })
        ).resolves.toBeDefined();
    });

    it('cztery razy po 0,5 dnia przy puli 2 dni: czwarty wpis jeszcze się mieści', async () => {
        mockState.absences = [
            absenceRow({ id: 1, dateFrom: '2026-09-14', dateTo: '2026-09-14', startTime: '08:00', endTime: '12:00', workingDaysCount: 0.5 }),
            absenceRow({ id: 2, dateFrom: '2026-09-15', dateTo: '2026-09-15', startTime: '08:00', endTime: '12:00', workingDaysCount: 0.5 }),
            absenceRow({ id: 3, dateFrom: '2026-09-16', dateTo: '2026-09-16', startTime: '08:00', endTime: '12:00', workingDaysCount: 0.5 }),
        ];
        await expect(
            ScrumboardVacationsController.addAbsence({
                personId: 1,
                typeId: OPIEKA.id,
                dateFrom: '2026-09-17',
                dateTo: '2026-09-17',
                startTime: '08:00',
                endTime: '12:00',
                note: null,
            })
        ).resolves.toBeDefined();
    });

    it('piąte pół dnia przy puli 2 dni jest odrzucane, i to jako 400', async () => {
        mockState.absences = [1, 2, 3, 4].map((id) =>
            absenceRow({
                id,
                dateFrom: `2026-09-1${id + 3}`,
                dateTo: `2026-09-1${id + 3}`,
                startTime: '08:00',
                endTime: '12:00',
                workingDaysCount: 0.5,
            })
        );
        await expect(
            ScrumboardVacationsController.addAbsence({
                personId: 1,
                typeId: OPIEKA.id,
                dateFrom: '2026-09-21',
                dateTo: '2026-09-21',
                startTime: '08:00',
                endTime: '12:00',
                note: null,
            })
        ).rejects.toBeInstanceOf(BadRequestError);
    });

    it('komunikat o pustej puli mówi liczbami po polsku', async () => {
        mockState.absences = [1, 2, 3, 4].map((id) =>
            absenceRow({
                id,
                dateFrom: `2026-09-1${id + 3}`,
                dateTo: `2026-09-1${id + 3}`,
                startTime: '08:00',
                endTime: '12:00',
                workingDaysCount: 0.5,
            })
        );
        await expect(
            ScrumboardVacationsController.addAbsence({
                personId: 1,
                typeId: OPIEKA.id,
                dateFrom: '2026-09-21',
                dateTo: '2026-09-21',
                startTime: '08:00',
                endTime: '10:00',
                note: null,
            })
        ).rejects.toThrow('Brak dostępnych dni opieki (pula: 2, wykorzystane: 2, żądane: 0,25).');
    });
});

describe('flaga typu decyduje, czy wolno wpisać godziny', () => {
    it('L4 na godziny jest odrzucane komunikatem z nazwą typu', async () => {
        await expect(
            ScrumboardVacationsController.addAbsence({
                personId: 1,
                typeId: L4.id,
                dateFrom: '2026-09-18',
                dateTo: '2026-09-18',
                startTime: '08:00',
                endTime: '12:00',
                note: null,
            })
        ).rejects.toThrow('Typ «L4» można wpisać tylko na całe dni.');
    });

    it('L4 na cały dzień przechodzi bez przeszkód', async () => {
        await expect(
            ScrumboardVacationsController.addAbsence({
                personId: 1,
                typeId: L4.id,
                dateFrom: '2026-09-18',
                dateTo: '2026-09-18',
                ...CALY_DZIEN,
            })
        ).resolves.toBeDefined();
    });
});

describe('blokada drugiej nieobecności w zajętym terminie', () => {
    beforeEach(() => {
        mockState.absences = [
            absenceRow({
                id: 7,
                typeId: WYPOCZYNKOWY.id,
                dateFrom: '2026-09-14',
                dateTo: '2026-09-16',
                workingDaysCount: 3,
                _typeName: 'Wypoczynkowy',
                _countsAgainstLimit: true,
                _countsAsCare: false,
            }),
        ];
    });

    it('dzień w środku cudzego zakresu jest zajęty, nie tylko dzień identyczny', async () => {
        await expect(
            ScrumboardVacationsController.addAbsence({
                personId: 1,
                typeId: OPIEKA.id,
                dateFrom: '2026-09-15',
                dateTo: '2026-09-15',
                startTime: '08:00',
                endTime: '12:00',
                note: null,
            })
        ).rejects.toThrow(
            'Ta osoba ma już nieobecność w tym terminie: «Wypoczynkowy», 14–16 września. Zmień termin albo popraw tamten wpis.'
        );
    });

    it('dzień obok zajętego zakresu przechodzi', async () => {
        await expect(
            ScrumboardVacationsController.addAbsence({
                personId: 1,
                typeId: OPIEKA.id,
                dateFrom: '2026-09-17',
                dateTo: '2026-09-17',
                startTime: '08:00',
                endTime: '12:00',
                note: null,
            })
        ).resolves.toBeDefined();
    });

    it('blokada dotyczy też całych dni, nie tylko godzinowych', async () => {
        await expect(
            ScrumboardVacationsController.addAbsence({
                personId: 1,
                typeId: OPIEKA.id,
                dateFrom: '2026-09-16',
                dateTo: '2026-09-18',
                ...CALY_DZIEN,
            })
        ).rejects.toThrow(/ma już nieobecność w tym terminie/);
    });

    it('edycja własnego wpisu nie koliduje sama ze sobą', async () => {
        await expect(
            ScrumboardVacationsController.editAbsence(7, {
                typeId: WYPOCZYNKOWY.id,
                dateFrom: '2026-09-14',
                dateTo: '2026-09-15',
                ...CALY_DZIEN,
            })
        ).resolves.toBeDefined();
        expect(mockState.updated.workingDaysCount).toBe(2);
    });

    it('edycja w cudzy termin jest odrzucana', async () => {
        mockState.absences.push(
            absenceRow({
                id: 8,
                dateFrom: '2026-09-21',
                dateTo: '2026-09-21',
                workingDaysCount: 1,
            })
        );
        await expect(
            ScrumboardVacationsController.editAbsence(7, {
                typeId: WYPOCZYNKOWY.id,
                dateFrom: '2026-09-14',
                dateTo: '2026-09-21',
                ...CALY_DZIEN,
            })
        ).rejects.toThrow(/ma już nieobecność w tym terminie/);
    });

    it('inna osoba w tym samym terminie to nie kolizja', async () => {
        // druga osoba potrzebuje własnej puli, inaczej odbije się o pustą pulę opieki
        // i test mierzyłby co innego, niż deklaruje
        mockState.entitlements.push({
            personId: 2,
            year: 2026,
            limitDays: 26,
            carryoverDays: 0,
            careDays: 2,
            holidayDays: 1,
        });
        await expect(
            ScrumboardVacationsController.addAbsence({
                personId: 2,
                typeId: OPIEKA.id,
                dateFrom: '2026-09-15',
                dateTo: '2026-09-15',
                startTime: '08:00',
                endTime: '12:00',
                note: null,
            })
        ).resolves.toBeDefined();
    });
});

describe('liczniki tygodniowe znoszą ułamki', () => {
    it('pół dnia w bieżącym tygodniu daje 0,5', async () => {
        mockState.absences = [
            absenceRow({
                dateFrom: '2026-09-16', // środa
                dateTo: '2026-09-16',
                startTime: '08:00',
                endTime: '12:00',
                workingDaysCount: 0.5,
            }),
        ];
        const counts = await ScrumboardVacationsController.getWeekCounts(
            new Date(2026, 8, 16)
        );
        expect(counts[0].current).toBe(0.5);
        expect(counts[0].prev).toBe(0);
    });
});
