import { describe, expect, it, jest } from '@jest/globals';
import PublicProfileSubmissionRepository from '../PublicProfileSubmissionRepository';
import ToolsDb from '../../../tools/ToolsDb';

/**
 * ROD-5: domyślny adresat linku do publicznego formularza. Adres zapasowy (gdy osoba nie ma
 * e-maila kontaktowego) pochodzi z konta, nie z zaszłej kolumny Persons.SystemEmail.
 */
describe('PublicProfileSubmissionRepository - ROD-5: domyślny adresat linku', () => {
    it('e-mail zapasowy bierze z konta, nie z zaszłej kolumny Persons', async () => {
        const querySpy = jest
            .spyOn(ToolsDb, 'getQueryCallbackAsync')
            .mockResolvedValue([
                { Email: null, SystemEmail: 'konto@firma.pl' },
            ] as any);

        const result =
            await new PublicProfileSubmissionRepository().getDefaultRecipientEmailForPerson(
                5,
            );

        const sql = String(querySpy.mock.calls[0][0]);
        expect(sql).toContain('PersonAccounts.SystemEmail');
        expect(sql).not.toContain('Persons.SystemEmail');
        expect(sql).toContain(
            'LEFT JOIN PersonAccounts ON PersonAccounts.PersonId = Persons.Id',
        );
        expect(result).toBe('konto@firma.pl');
    });

    it('adres kontaktowy osoby ma pierwszeństwo przed e-mailem logowania', async () => {
        jest.spyOn(ToolsDb, 'getQueryCallbackAsync').mockResolvedValue([
            { Email: 'kontakt@firma.pl', SystemEmail: 'konto@firma.pl' },
        ] as any);

        await expect(
            new PublicProfileSubmissionRepository().getDefaultRecipientEmailForPerson(
                5,
            ),
        ).resolves.toBe('kontakt@firma.pl');
    });
});
