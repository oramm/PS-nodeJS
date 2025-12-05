import { OAuth2Client } from 'google-auth-library';
import mysql from 'mysql2/promise';
import BaseRepository from '../repositories/BaseRepository';
import { oAuthClient } from '../setup/Sessions/ToolsGapi';

/**
 * Generyczna klasa bazowa dla wszystkich kontrolerów.
 * Zapewnia podstawowe operacje CRUD używając repozytoriów.
 */
export default abstract class BaseController<
    T,
    TRepository extends BaseRepository<T>
> {
    protected repository: TRepository;

    constructor(repository: TRepository) {
        this.repository = repository;
    }

    /**
     * Wykonuje metodę Controller z automatycznym lub przekazanym OAuth2Client
     * Eliminuje potrzebę gapiReguestHandler w Routerze i getInstance() w każdej metodzie
     *
     * UŻYCIE W ROUTERZE (bez auth - withAuth pobierze token):
     * ```typescript
     * router.put('/case/:id', async (req, res, next) => {
     *     try {
     *         const item = new Case(req.parsedBody);
     *         const result = await CasesController.edit(item);  // Bez auth
     *         res.send(result);
     *     } catch (error) {
     *         next(error);
     *     }
     * });
     * ```
     *
     * UŻYCIE W MODELU (z istniejącym auth - NIE pobiera ponownie):
     * ```typescript
     * async createCase(auth: OAuth2Client) {
     *     const caseItem = new Case({...});
     *     const result = await CasesController.add(caseItem, auth);  // Przekazuje auth
     *     return result.caseItem;
     * }
     * ```
     *
     * UŻYCIE W CONTROLLERZE:
     * ```typescript
     * // Metoda publiczna statyczna (wywoływana z Routera lub Modelu)
     * static async edit(item: Case, auth?: OAuth2Client): Promise<Case> {
     *     return await this.withAuth(
     *         (instance, authClient) => instance.editCase(authClient, item),
     *         auth  // Przekaż auth jeśli jest
     *     );
     * }
     *
     * // Metoda prywatna instancji (logika biznesowa)
     * private async editCase(auth: OAuth2Client, item: Case): Promise<Case> {
     *     // Logika z dostępem do this.repository
     * }
     * ```
     *
     * @param callback - Funkcja otrzymująca (instance, auth) i zwracająca Promise<TResult>
     * @param existingAuth - Opcjonalny istniejący OAuth2Client (jeśli nie przekazany, pobierze nowy token)
     * @returns Wynik wykonania callback
     * @throws Error jeśli brak REFRESH_TOKEN (tylko gdy existingAuth nie jest przekazany)
     * @throws Error jeśli OAuth token jest nieprawidłowy
     */
    protected static async withAuth<TResult>(
        callback: (instance: any, auth: OAuth2Client) => Promise<TResult>,
        existingAuth?: OAuth2Client
    ): Promise<TResult> {
        console.log('--------------- authenticate (withAuth) ----------------');

        try {
            // Pobierz instancję przez getInstance (jeśli istnieje) lub stwórz nową
            const instance = (this as any).getInstance
                ? (this as any).getInstance()
                : new (this as any)();

            // Jeśli auth został przekazany - użyj go (NIE pobieraj ponownie tokenu)
            if (existingAuth) {
                console.log('Using existing OAuth2Client (no token refresh)');
                return await callback(instance, existingAuth);
            }

            // W przeciwnym razie - pobierz nowy token
            console.log('Fetching new OAuth token from REFRESH_TOKEN');
            const refreshToken = process.env.REFRESH_TOKEN;
            if (!refreshToken) throw new Error("Can't get refresh token");

            // Ustaw credentials
            oAuthClient.setCredentials({ refresh_token: refreshToken });

            // ✅ POPRAWKA: Wymuś pobranie access tokenu (jak w ToolsGapi.getNewCredentials)
            const tokens = await oAuthClient.getAccessToken();
            if (!tokens.token) {
                throw new Error('Failed to obtain access token from Google');
            }

            // Wykonaj callback z instancją i auth
            return await callback(instance, oAuthClient);
        } catch (error) {
            if (
                error instanceof Error &&
                error.message?.includes('invalid_request')
            ) {
                throw new Error(
                    'Google OAuth token is invalid or expired. Please regenerate the refresh token.'
                );
            }
            throw error;
        }
    }

    /**
     * Tworzy nowy obiekt
     */
    async create(
        entity: T,
        externalConn?: mysql.PoolConnection,
        isPartOfTransaction?: boolean
    ): Promise<any> {
        return await this.repository.addInDb(
            entity,
            externalConn,
            isPartOfTransaction
        );
    }

    /**
     * Aktualizuje istniejący obiekt
     */
    async edit(
        entity: T,
        externalConn?: mysql.PoolConnection,
        isPartOfTransaction?: boolean,
        fieldsToUpdate?: string[]
    ): Promise<any> {
        return await this.repository.editInDb(
            entity,
            externalConn,
            isPartOfTransaction,
            fieldsToUpdate
        );
    }

    /**
     * Usuwa obiekt
     */
    async delete(
        entity: T,
        externalConn?: mysql.PoolConnection,
        isPartOfTransaction?: boolean
    ): Promise<any> {
        return await this.repository.deleteFromDb(
            entity,
            externalConn,
            isPartOfTransaction
        );
    }

    /**
     * Pobiera listę obiektów
     */
    async find(conditions?: any): Promise<T[]> {
        return await this.repository.find(conditions);
    }
}
