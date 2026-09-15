import { describe, expect, it, jest } from '@jest/globals';
import PersonRepository from '../PersonRepository';

/**
 * ROD-2: GET /v2/persons/:id/account nie może oddawać tokenów odświeżania (sekret logowania).
 * Test na warstwie repozytorium: nawet gdy wiersz PersonAccounts NIESIE tokeny, zmapowany wynik
 * ich nie zawiera. Pola potrzebne panelowi uprawnień (rola, e-mail, konto Google, aktywność,
 * FIDman) zostają.
 */
describe('getPersonAccountV2 (ROD-2) — odpowiedz konta bez tokenow', () => {
    it('nie zwraca googleRefreshToken ani microsoftRefreshToken, nawet gdy sa w wierszu', async () => {
        const repo = new PersonRepository();
        const executeQuery = jest
            .spyOn(repo as any, 'executeQuery')
            .mockResolvedValue([
                {
                    PersonId: 125,
                    SystemRoleId: 2,
                    SystemEmail: 'x@envi.com.pl',
                    GoogleId: 'gid-123',
                    GoogleRefreshToken: 'SEKRET-google-nie-oddawac',
                    MicrosoftId: null,
                    MicrosoftRefreshToken: 'SEKRET-ms-nie-oddawac',
                    IsActive: 1,
                    FidmanEnabled: 0,
                },
            ] as any);

        const account = await repo.getPersonAccountV2(125);

        expect(account).toBeDefined();
        expect(account).not.toHaveProperty('googleRefreshToken');
        expect(account).not.toHaveProperty('microsoftRefreshToken');
        expect(account).toMatchObject({
            personId: 125,
            systemRoleId: 2,
            systemEmail: 'x@envi.com.pl',
            googleId: 'gid-123',
            isActive: true,
            fidmanEnabled: false,
        });

        // Zapytanie SQL też nie powinno wybierać kolumn tokenów.
        const sql = String(executeQuery.mock.calls[0][0]);
        expect(sql).not.toMatch(/RefreshToken/);
    });
});
