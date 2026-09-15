import { describe, expect, it } from '@jest/globals';
import {
    hasPlaceholderMarker,
    PUBLIC_PROFILE_PRIVACY_NOTICE,
    renderPrivacyNoticeText,
} from '../publicProfileSubmissionPrivacyNotice';

/**
 * ROD-7 (D-ROD-7): klauzula informacyjna publicznego formularza. Ostatni test niżej jest STRAŻNIKIEM
 * WYDANIA i jest CELOWO CZERWONY, dopóki w kodzie jest tekst zastępczy - strona bez tekstu ownera
 * nie ma wyjść na produkcję (zasada wydania: pełna suita zielona). Zielony staje się dopiero po
 * wstawieniu tekstu ownera/prawnika i ustawieniu `isPlaceholder: false`.
 */
describe('publicProfileSubmissionPrivacyNotice - kształt klauzuli', () => {
    it('ma tytuł i komplet sekcji, każda z nagłówkiem i treścią', () => {
        expect(PUBLIC_PROFILE_PRIVACY_NOTICE.title.trim().length).toBeGreaterThan(0);
        expect(PUBLIC_PROFILE_PRIVACY_NOTICE.sections.length).toBeGreaterThanOrEqual(4);
        for (const section of PUBLIC_PROFILE_PRIVACY_NOTICE.sections) {
            expect(section.heading.trim().length).toBeGreaterThan(0);
            expect(section.text.trim().length).toBeGreaterThan(0);
        }
    });

    it('mówi, kto jest administratorem, po co zbiera dane i jak długo je trzyma', () => {
        const headings = PUBLIC_PROFILE_PRIVACY_NOTICE.sections.map((s) => s.heading);
        expect(headings).toEqual(
            expect.arrayContaining([
                'Kto jest administratorem Twoich danych?',
                'W jakim celu przetwarzamy dane?',
                'Jak długo przechowujemy dane?',
            ]),
        );
    });

    it('flaga tekstu zastępczego zgadza się ze znacznikami w treści (nie da się jej przełączyć bez sprzątnięcia znaczników)', () => {
        expect(hasPlaceholderMarker(PUBLIC_PROFILE_PRIVACY_NOTICE)).toBe(
            PUBLIC_PROFILE_PRIVACY_NOTICE.isPlaceholder,
        );
    });

    it('tekst do maila zawiera tytuł i każdą sekcję; przy tekście zastępczym ostrzega, przy docelowym nie', () => {
        const text = renderPrivacyNoticeText(PUBLIC_PROFILE_PRIVACY_NOTICE);
        expect(text).toContain(PUBLIC_PROFILE_PRIVACY_NOTICE.title);
        for (const section of PUBLIC_PROFILE_PRIVACY_NOTICE.sections) {
            expect(text).toContain(`${section.heading}: ${section.text}`);
        }

        const finalNotice = {
            isPlaceholder: false,
            title: 'Tytuł',
            sections: [{ heading: 'Nagłówek', text: 'Treść' }],
        };
        expect(renderPrivacyNoticeText(finalNotice)).not.toContain('TEKST ZASTĘPCZY');
        expect(renderPrivacyNoticeText({ ...finalNotice, isPlaceholder: true })).toContain(
            'TEKST ZASTĘPCZY',
        );
    });
});

describe('publicProfileSubmissionPrivacyNotice - STRAŻNIK WYDANIA (ROD-7)', () => {
    it('klauzula ma tekst od ownera, nie zastępczy (CZERWONY do czasu wstawienia tekstu - tak ma być)', () => {
        expect(PUBLIC_PROFILE_PRIVACY_NOTICE.isPlaceholder).toBe(false);
        expect(hasPlaceholderMarker(PUBLIC_PROFILE_PRIVACY_NOTICE)).toBe(false);
    });
});
