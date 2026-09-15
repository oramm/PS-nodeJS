import { describe, expect, it } from '@jest/globals';
import { SystemRoleName } from '../../types/sessionTypes';
import {
    personsListReceivesFullShape,
    projectPersonsForRole,
} from '../personsListVisibility';
import type Person from '../Person';

const sample = [
    {
        id: 7,
        name: 'Jan',
        surname: 'Kowalski',
        email: 'jan.kontakt@example.test',
        cellphone: '600100200',
        phone: '717000000',
        position: 'Inspektor',
        comment: 'notatka wewnetrzna',
        entityId: 3,
        systemRoleId: 2,
        systemEmail: 'jan@envi.com.pl',
        _skillNames: 'BHP, kosztorysy',
        _entity: { id: 3, name: 'Podmiot testowy' },
        _nameSurnameEmail: 'Jan Kowalski jan.kontakt@example.test',
    },
] as unknown as Person[];

const FULL_SHAPE_ROLES = [
    SystemRoleName.ADMIN,
    SystemRoleName.ENVI_MANAGER,
    SystemRoleName.ENVI_EMPLOYEE,
];
const TRIMMED_ROLES = [
    SystemRoleName.ENVI_COOPERATOR,
    SystemRoleName.EXTERNAL_USER,
    SystemRoleName.CONTRACT_WORKER,
    SystemRoleName.CLIENT,
];

describe('personsListVisibility (ROD-1)', () => {
    it('personel ENVI dostaje pelny ksztalt osoby', () => {
        for (const role of FULL_SHAPE_ROLES) {
            expect(personsListReceivesFullShape(role)).toBe(true);
            const out = projectPersonsForRole(sample, role) as any[];
            expect(out[0]).toBe(sample[0]); // ten sam obiekt, bez zawezania
            expect(out[0]).toHaveProperty('cellphone');
            expect(out[0]).toHaveProperty('systemEmail');
            expect(out[0]).toHaveProperty('position');
        }
    });

    it('role spoza personelu dostaja tylko id, imie, nazwisko, e-mail + etykiete selektora', () => {
        for (const role of TRIMMED_ROLES) {
            expect(personsListReceivesFullShape(role)).toBe(false);
            const out = projectPersonsForRole(sample, role) as any[];
            expect(Object.keys(out[0]).sort()).toEqual([
                '_nameSurnameEmail',
                'email',
                'id',
                'name',
                'surname',
            ]);
            // etykieta selektora to konkatenacja dozwolonych pol, nie nowa dana
            expect(out[0]._nameSurnameEmail).toBe(
                'Jan Kowalski jan.kontakt@example.test',
            );
            for (const leaked of [
                'cellphone',
                'phone',
                'position',
                'comment',
                'systemEmail',
                'systemRoleId',
                'entityId',
                '_skillNames',
                '_entity',
            ]) {
                expect(out[0]).not.toHaveProperty(leaked);
            }
        }
    });

    it('brak albo nieznana rola = najwezszy ksztalt (fail-safe)', () => {
        expect(personsListReceivesFullShape(undefined)).toBe(false);
        const out = projectPersonsForRole(sample, undefined) as any[];
        expect(Object.keys(out[0]).sort()).toEqual([
            '_nameSurnameEmail',
            'email',
            'id',
            'name',
            'surname',
        ]);
    });
});
