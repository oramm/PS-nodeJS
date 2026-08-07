import { describe, it, expect } from '@jest/globals';
import {
    isFolderSelected,
    optionalFoldersForContractType,
    parseOptionalFoldersSelection,
} from '../optionalContractFolders';

describe('optionalContractFolders', () => {
    describe('optionalFoldersForContractType()', () => {
        it('umowa ENVI dostaje tylko folder notatek ze spotkań', () => {
            const folders = optionalFoldersForContractType(true);
            expect(folders.map((f) => f.key)).toEqual(['MEETING_PROTOCOLS']);
        });

        it('umowa zewnętrzna dostaje dodatkowo Wnioski Materiałowe', () => {
            const folders = optionalFoldersForContractType(false);
            expect(folders.map((f) => f.key)).toEqual([
                'MEETING_PROTOCOLS',
                'MATERIAL_CARDS',
            ]);
        });

        it('oba foldery startują zaznaczone - bez regresji względem dzisiejszego zachowania', () => {
            expect(
                optionalFoldersForContractType(false).every((f) => f.isDefault)
            ).toBe(true);
        });
    });

    describe('isFolderSelected()', () => {
        it('brak selekcji oznacza "twórz wszystko" (kompatybilność wsteczna)', () => {
            expect(isFolderSelected('MEETING_PROTOCOLS', undefined)).toBe(true);
            expect(isFolderSelected('MATERIAL_CARDS', undefined)).toBe(true);
        });

        it('pusta tablica oznacza "nie twórz nic" - świadomy wybór użytkownika', () => {
            expect(isFolderSelected('MEETING_PROTOCOLS', [])).toBe(false);
            expect(isFolderSelected('MATERIAL_CARDS', [])).toBe(false);
        });

        it('respektuje wybór częściowy', () => {
            const selection = ['MEETING_PROTOCOLS'] as const;
            expect(isFolderSelected('MEETING_PROTOCOLS', [...selection])).toBe(
                true
            );
            expect(isFolderSelected('MATERIAL_CARDS', [...selection])).toBe(
                false
            );
        });
    });

    describe('parseOptionalFoldersSelection()', () => {
        it('zwraca undefined dla braku pola i złego kształtu', () => {
            expect(parseOptionalFoldersSelection(undefined)).toBeUndefined();
            expect(parseOptionalFoldersSelection('MEETING_PROTOCOLS')).toBeUndefined();
            expect(parseOptionalFoldersSelection({})).toBeUndefined();
        });

        it('odsiewa klucze spoza katalogu i duplikaty', () => {
            expect(
                parseOptionalFoldersSelection([
                    'MEETING_PROTOCOLS',
                    'MEETING_PROTOCOLS',
                    'PISMA',
                    42,
                    null,
                ])
            ).toEqual(['MEETING_PROTOCOLS']);
        });

        it('pustą tablicę przepuszcza jako pustą - to nie to samo co brak pola', () => {
            expect(parseOptionalFoldersSelection([])).toEqual([]);
        });
    });
});
