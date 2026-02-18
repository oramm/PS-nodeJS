import { describe, expect, it } from '@jest/globals';
import ProfileSkillRepository from '../ProfileSkillRepository';

describe('ProfileSkillRepository mapping', () => {
    const repository = new ProfileSkillRepository();

    it('maps SkillDescription to _skill.description in mapRowToModel', () => {
        const mapped = (repository as any).mapRowToModel({
            Id: 1,
            PersonProfileId: 10,
            SkillId: 5,
            LevelCode: 'advanced',
            YearsOfExperience: 4.5,
            SortOrder: 2,
            SkillName: 'TypeScript',
            SkillNameNormalized: 'typescript',
            SkillDescription: 'Frontend language',
        });

        expect(mapped._skill).toEqual({
            id: 5,
            name: 'TypeScript',
            nameNormalized: 'typescript',
            description: 'Frontend language',
        });
    });

    it('maps null SkillDescription to _skill.description = null in mapRowToRecord', () => {
        const mapped = (repository as any).mapRowToRecord({
            Id: 2,
            PersonProfileId: 20,
            SkillId: 8,
            LevelCode: null,
            YearsOfExperience: null,
            SortOrder: 0,
            SkillName: 'Node.js',
            SkillNameNormalized: 'node.js',
            SkillDescription: null,
        });

        expect(mapped._skill).toEqual({
            id: 8,
            name: 'Node.js',
            nameNormalized: 'node.js',
            description: null,
        });
    });
});
