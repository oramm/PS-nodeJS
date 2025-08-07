import ToolsDb from '../tools/ToolsDb';
import mysql from 'mysql2/promise';

/**
 * Generyczna klasa bazowa dla wszystkich repozytoriów.
 * Implementuje podstawowe operacje CRUD na bazie danych.
 */
export default abstract class BaseRepository<T> {
    protected tableName: string;

    constructor(tableName: string) {
        this.tableName = tableName;
    }

    /**
     * Dodaje nowy rekord do bazy danych
     */
    async addInDb(
        entity: T,
        externalConn?: mysql.PoolConnection,
        isPartOfTransaction?: boolean
    ): Promise<any> {
        return await ToolsDb.addInDb(
            this.tableName,
            entity,
            externalConn,
            isPartOfTransaction
        );
    }

    /**
     * Aktualizuje istniejący rekord w bazie danych
     */
    async editInDb(
        entity: T,
        externalConn?: mysql.PoolConnection,
        isPartOfTransaction: boolean = false,
        fieldsToUpdate?: string[]
    ): Promise<any> {
        return await ToolsDb.editInDb(
            this.tableName,
            entity,
            externalConn,
            isPartOfTransaction,
            fieldsToUpdate
        );
    }

    /**
     * Usuwa rekord z bazy danych
     */
    async deleteFromDb(
        entity: T,
        externalConn?: mysql.PoolConnection,
        isPartOfTransaction?: boolean
    ): Promise<any> {
        return await ToolsDb.deleteFromDb(
            this.tableName,
            entity,
            externalConn,
            isPartOfTransaction
        );
    }

    /**
     * Wykonuje zapytanie SQL i zwraca wyniki
     */
    protected async executeQuery(sql: string): Promise<any[]> {
        const result = await ToolsDb.getQueryCallbackAsync(sql);
        return Array.isArray(result) ? result : [];
    }

    /** Tworzy fragment WHERE gdzie elementy tablicy - grupy warunków są połączene przez OR
     */
    protected makeOrGroupsConditions<Conditions>(
        orConditions: Conditions[],
        makeAndConditions: (orCondition: Conditions) => string
    ) {
        const orGroups = orConditions.map(
            (orCondition) => '(' + makeAndConditions(orCondition) + ')'
        );
        const orGroupsCondition = orGroups.join(' OR ');
        return orGroupsCondition || '1';
    }

    /**
     * Abstrakcyjna metoda do mapowania surowych danych z bazy na instancje modelu.
     * Każde repozytorium musi zaimplementować własną logikę mapowania.
     */
    protected abstract mapRowToEntity(row: any): T;

    /**
     * Abstrakcyjna metoda do wyszukiwania rekordów.
     * Każde repozytorium może zaimplementować własną logikę filtrowania.
     */
    abstract find(conditions?: any): Promise<T[]>;
}
