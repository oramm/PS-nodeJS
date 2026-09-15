import { afterEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../../../tools/ToolsDb');

import PublicProfileSubmissionController from '../PublicProfileSubmissionController';
import PublicProfileSubmissionRepository from '../PublicProfileSubmissionRepository';
import ToolsDb from '../../../tools/ToolsDb';
import ToolsMail from '../../../tools/ToolsMail';
import { PUBLIC_PROFILE_PRIVACY_NOTICE } from '../publicProfileSubmissionPrivacyNotice';

/**
 * ROD-7: klauzula informacyjna dociera do osoby dwiema drogami - w odpowiedzi publicznej trasy
 * (strona formularza czyta ją na starcie) i w mailu z linkiem. Repozytorium i poczta zamockowane;
 * sprawdzana jest orkiestracja kontrolera, nie SQL.
 */
describe('PublicProfileSubmissionController - ROD-7: klauzula informacyjna', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('GET publiczny: odpowiedź niesie klauzulę obok danych zgłoszenia', async () => {
        const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        jest.spyOn(
            PublicProfileSubmissionRepository.prototype,
            'findLinkByTokenHash',
        ).mockResolvedValue({
            id: 7,
            personId: 99,
            tokenHash: 'hash',
            expiresAt: future,
        } as any);
        jest.spyOn(
            PublicProfileSubmissionRepository.prototype,
            'findSubmissionByLinkId',
        ).mockResolvedValue({
            id: 11,
            linkId: 7,
            personId: 99,
            status: 'DRAFT',
            createdAt: '2026-09-08 10:00:00',
            updatedAt: '2026-09-08 10:00:00',
        } as any);
        jest.spyOn(
            PublicProfileSubmissionRepository.prototype,
            'getSubmissionItems',
        ).mockResolvedValue([]);

        const result: any =
            await PublicProfileSubmissionController.getPublicSubmission('token');

        expect(result.id).toBe(11);
        expect(result.status).toBe('DRAFT');
        expect(result.privacyNotice).toEqual(PUBLIC_PROFILE_PRIVACY_NOTICE);
        expect(result.privacyNotice.title).toBe(
            'Informacja o przetwarzaniu danych osobowych',
        );
    });

    it('widok dla personelu (szczegóły zgłoszenia) klauzuli nie dokleja', async () => {
        jest.spyOn(
            PublicProfileSubmissionRepository.prototype,
            'findSubmissionById',
        ).mockResolvedValue({
            id: 11,
            linkId: 7,
            personId: 99,
            status: 'DRAFT',
            createdAt: '2026-09-08 10:00:00',
            updatedAt: '2026-09-08 10:00:00',
        } as any);
        jest.spyOn(
            PublicProfileSubmissionRepository.prototype,
            'getSubmissionItems',
        ).mockResolvedValue([]);

        const result: any =
            await PublicProfileSubmissionController.getSubmissionDetails(99, 11);

        expect(result.id).toBe(11);
        expect(result.privacyNotice).toBeUndefined();
    });

    it('mail z linkiem: poprawny polski temat, link, data wygaśnięcia i pełna klauzula', async () => {
        const sendMail = jest
            .spyOn(ToolsMail, 'sendMail')
            .mockResolvedValue(undefined as any);
        const instance = (PublicProfileSubmissionController as any).getInstance();
        const expiresAt = new Date('2026-10-08T10:00:00.000Z');

        await instance.sendSubmissionLinkMail(
            'osoba@test.local',
            'https://example.test/#/public/experience-update/abc',
            expiresAt,
        );

        expect(sendMail).toHaveBeenCalledTimes(1);
        const params = sendMail.mock.calls[0][0] as any;
        expect(params.to).toBe('osoba@test.local');
        expect(params.subject).toBe('Link do uzupełnienia profilu');
        expect(params.text).toContain(
            'https://example.test/#/public/experience-update/abc',
        );
        expect(params.text).toContain('Link wygasa: 2026-10-08');
        expect(params.text).toContain(PUBLIC_PROFILE_PRIVACY_NOTICE.title);
        for (const section of PUBLIC_PROFILE_PRIVACY_NOTICE.sections) {
            expect(params.text).toContain(`${section.heading}: `);
        }
        // Jawny HTML omija wadliwą konwersję nowych linii w ToolsMail.
        expect(params.html).toContain('<a href="https://example.test/#/public/experience-update/abc"');
        expect(params.html).toContain('Link wygasa: 2026-10-08.</p>');
        expect(params.html).toMatch(/<h2[^>]*>Informacja o przetwarzaniu danych osobowych<\/h2>/);
        expect(params.html.match(/<h3 /g)).toHaveLength(PUBLIC_PROFILE_PRIVACY_NOTICE.sections.length);
        for (const section of PUBLIC_PROFILE_PRIVACY_NOTICE.sections) {
            expect(params.html).toContain('>' + section.heading + '</h3>');
            expect(params.html).toContain('>' + section.text + '</p>');
        }
        expect(params.text).toContain('\n\nKto jest administratorem Twoich danych?:');
        expect(params.text).not.toContain('�');
        expect(params.subject).not.toContain('�');
    });
});

describe('PublicProfileSubmissionController - mail z kodem weryfikacyjnym', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('wysyła polski temat i treść', async () => {
        (ToolsDb.transaction as jest.Mock).mockImplementation(async (fn: any) =>
            fn({}),
        );
        jest.spyOn(
            PublicProfileSubmissionRepository,
            'generateCode',
        ).mockReturnValue('123456');
        const sendMail = jest
            .spyOn(ToolsMail, 'sendMail')
            .mockResolvedValue(undefined as any);
        const instance = (PublicProfileSubmissionController as any).getInstance();
        jest.spyOn(instance, 'resolveLinkAndSubmissionInConn').mockResolvedValue({
            submission: { id: 11 },
        });
        jest.spyOn(instance.repository, 'updateSubmissionEmail').mockResolvedValue(
            undefined,
        );
        jest.spyOn(instance.repository, 'createVerifyChallenge').mockResolvedValue(
            undefined,
        );

        await PublicProfileSubmissionController.requestVerifyCode(
            'token',
            'osoba@test.local',
        );

        expect(sendMail).toHaveBeenCalledTimes(1);
        const params = sendMail.mock.calls[0][0] as any;
        expect(params.subject).toBe('Kod weryfikacyjny do aktualizacji profilu');
        expect(params.text).toBe(
            'Twój kod weryfikacyjny: 123456. Kod jest ważny przez 10 minut.',
        );
        expect(params.subject).not.toMatch(/verification|submission/i);
        expect(params.text).not.toMatch(/verification|valid for/i);
    });
});
