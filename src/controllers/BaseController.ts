import { OAuth2Client } from 'google-auth-library';
import mysql from 'mysql2/promise';
import BaseRepository from '../repositories/BaseRepository';
import { oAuthClient } from '../setup/Sessions/ToolsGapi';

/**
 * Generyczna klasa bazowa dla wszystkich kontrolerów.
 * Zapewnia podstawowe operacje CRUD używając repozytoriów.
 *
 * Wzorzec: Singleton + static methods
 *
 * ARCHITEKTURA:
 * - getInstance() ZAWSZE prywatny - nie eksponuj na zewnątrz
 * - Metody instancyjne (create, edit, delete, find) są TYLKO POMOCNICZE
 * - Każdy konkretny Controller MUSI eksponować STATYCZNE metody publiczne
 *
 * WYMAGANA IMPLEMENTACJA w każdym KONKRETNYM Controller:
 *
 * ```typescript
 * // Singleton - PRYWATNY
 * private static instance: MyController;
 * private static getInstance(): MyController {
 *     if (!this.instance) this.instance = new MyController();
 *     return this.instance;
 * }
 *
 * // PROSTY PRZYPADEK (np. asocjacje, proste modele):
 * static async add(item: T, conn?, isTransaction?): Promise<T> {
 *     const instance = this.getInstance();
 *     await instance.repository.addInDb(item, conn, isTransaction);
 *     return item;
 * }
 *
 * // ZŁOŻONY PRZYPADEK (np. z Google Drive, walidacją):
 * static async add(item: T, auth?: OAuth2Client): Promise<T> {
 *     return await this.withAuth(async (instance, authClient) => {
 *         // Logika biznesowa z auth
 *         await instance.repository.addInDb(item);
 *         return item;
 *     }, auth);
 * }
 *
 * // Pozostałe metody CRUD:
 * static async find(params: SearchParams): Promise<T[]> { ... }
 * static async edit(item: T, conn?, isTransaction?, fields?): Promise<T> { ... }
 * static async delete(item: T, conn?, isTransaction?): Promise<void> { ... }
 * ```
 *
 * UŻYCIE:
 * ```typescript
 * // ✅ POPRAWNIE - statyczne wywołanie:
 * await MyController.add(item, conn, true);
 *
 * // ❌ BŁĘDNIE - nie eksponuj getInstance():
 * await MyController.getInstance().create(item);  // NIE RÓB TAK!
 * ```
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
     * @deprecated Użyj bezpośrednio `instance.repository.addInDb(entity, conn, isTransaction)`.
     * Ta metoda jest tylko pass-through do repository i zostanie usunięta w przyszłości.
     *
     * Tworzy nowy obiekt w bazie danych.
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
     * @deprecated Użyj bezpośrednio `instance.repository.editInDb(entity, conn, isTransaction, fieldsToUpdate)`.
     * Ta metoda jest tylko pass-through do repository i zostanie usunięta w przyszłości.
     *
     * Aktualizuje istniejący obiekt w bazie danych.
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
     * @deprecated Użyj bezpośrednio `instance.repository.deleteFromDb(entity, conn, isTransaction)`.
     * Ta metoda jest tylko pass-through do repository i zostanie usunięta w przyszłości.
     *
     * Usuwa obiekt z bazy danych.
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
     * @deprecated Użyj bezpośrednio `instance.repository.find(conditions)`.
     * Ta metoda jest tylko pass-through do repository i zostanie usunięta w przyszłości.
     *
     * Pobiera listę obiektów z bazy danych.
     */
    async find(conditions?: any): Promise<T[]> {
        return await this.repository.find(conditions);
    }
}
