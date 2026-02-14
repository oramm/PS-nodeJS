import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import PersonRepository from '../PersonRepository';

jest.mock('../../tools/ToolsDb');

describe('PersonRepository – Session 3: skills search & filtering', () => {
    let repository: PersonRepository;

    beforeEach(() => {
        repository = new PersonRepository();
    });

    describe('makeAndConditions – skillIds filter', () => {
        it('generates EXISTS subquery for a single skillId', () => {
            const result = (repository as any).makeAndConditions(
                { skillIds: [5] },
                'v2',
            );

            expect(result).toContain('EXISTS');
            expect(result).toContain('PersonProfileSkills');
            expect(result).toContain('pps.SkillId IN (5)');
        });

        it('generates EXISTS subquery for multiple skillIds', () => {
            const result = (repository as any).makeAndConditions(
                { skillIds: [1, 2, 3] },
                'v2',
            );

            expect(result).toContain('pps.SkillId IN (1,2,3)');
        });

        it('skips skillIds filter when array is empty', () => {
            const result = (repository as any).makeAndConditions(
                { skillIds: [] },
                'v2',
            );

            expect(result).not.toContain('PersonProfileSkills');
        });

        it('skips skillIds filter when not provided', () => {
            const result = (repository as any).makeAndConditions({}, 'v2');

            expect(result).not.toContain('PersonProfileSkills');
        });
    });

    describe('makeAndConditions – hasProfile filter', () => {
        it('generates EXISTS subquery when hasProfile is true', () => {
            const result = (repository as any).makeAndConditions(
                { hasProfile: true },
                'v2',
            );

            expect(result).toContain('EXISTS');
            expect(result).toContain('PersonProfiles');
            expect(result).toContain('pp.PersonId = Persons.Id');
        });

        it('skips hasProfile filter when false', () => {
            const result = (repository as any).makeAndConditions(
                { hasProfile: false },
                'v2',
            );

            expect(result).not.toContain('PersonProfiles');
        });
    });

    describe('makeAndConditions – combined filters', () => {
        it('combines skillIds and hasProfile with AND', () => {
            const result = (repository as any).makeAndConditions(
                { skillIds: [7], hasProfile: true },
                'v2',
            );

            expect(result).toContain('PersonProfileSkills');
            expect(result).toContain('PersonProfiles');
            expect(result).toContain(' AND ');
        });

        it('combines skillIds with searchText', () => {
            const result = (repository as any).makeAndConditions(
                { skillIds: [2], searchText: 'Jan' },
                'v2',
            );

            expect(result).toContain('pps.SkillId IN (2)');
            expect(result).toContain("Persons.Name LIKE '%Jan%'");
        });
    });

    describe('makeSearchTextCondition – skill name search', () => {
        it('includes SkillsDictionary EXISTS subquery for a single word', () => {
            const result = (repository as any).makeSearchTextCondition('React');

            expect(result).toContain('SkillsDictionary');
            expect(result).toContain("sd.Name LIKE '%React%'");
        });

        it('includes skill search for each word in multi-word query', () => {
            const result = (repository as any).makeSearchTextCondition(
                'React Node',
            );

            expect(result).toContain("sd.Name LIKE '%React%'");
            expect(result).toContain("sd.Name LIKE '%Node%'");
            expect(result).toContain(' AND ');
        });

        it('still includes original person field searches', () => {
            const result =
                (repository as any).makeSearchTextCondition('Kowalski');

            expect(result).toContain('Persons.Name');
            expect(result).toContain('Persons.Surname');
            expect(result).toContain('Persons.Email');
            expect(result).toContain('Persons.Comment');
            expect(result).toContain('Persons.Position');
        });

        it('returns 1 for empty searchText', () => {
            expect(
                (repository as any).makeSearchTextCondition(undefined),
            ).toBe('1');
            expect((repository as any).makeSearchTextCondition('')).toBe('1');
        });
    });

    describe('mapRowToModel – _skillNames', () => {
        it('maps SkillNames column to _skillNames property', () => {
            const person = (repository as any).mapRowToModel({
                Id: 1,
                EntityId: 10,
                Name: 'Jan',
                Surname: 'Kowalski',
                Position: 'Developer',
                Email: 'jan@test.pl',
                Cellphone: '123456789',
                Phone: '987654321',
                Comment: '',
                SystemEmail: 'jan@system.pl',
                SystemRoleName: 'ADMIN',
                SystemRoleId: 1,
                EntityName: 'TestEntity',
                SkillNames: 'Node.js, React, TypeScript',
            });

            expect(person._skillNames).toBe('Node.js, React, TypeScript');
        });

        it('sets _skillNames to undefined when SkillNames is null', () => {
            const person = (repository as any).mapRowToModel({
                Id: 2,
                EntityId: 10,
                Name: 'Anna',
                Surname: 'Nowak',
                Position: '',
                Email: 'anna@test.pl',
                Cellphone: '',
                Phone: '',
                Comment: '',
                SystemEmail: null,
                SystemRoleName: 'USER',
                SystemRoleId: 2,
                EntityName: 'TestEntity',
                SkillNames: null,
            });

            expect(person._skillNames).toBeUndefined();
        });
    });
});
