import BaseRepository from '../repositories/BaseRepository';
import mysql from 'mysql2/promise';

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
