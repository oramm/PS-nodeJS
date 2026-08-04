import mysql from 'mysql2/promise';
import { ProjectScope } from '../types/sessionTypes';

/**
 * Warunek SQL zawężający zapytanie do projektów przypisanych zalogowanemu.
 *
 * Doklejany przez AND na zewnątrz grup OR budowanych z orConditions, bo orConditions
 * przychodzą od klienta - gdyby zakres był jednym z warunków wewnątrz grupy, dowolna
 * druga grupa OR omijałaby go w całości.
 *
 * @param columnExpr kolumna z OurId projektu w danym zapytaniu (np. 'Contracts.ProjectOurId')
 * @param scope undefined dla ról bez ograniczeń → '1' (brak filtra).
 *              Pusta lista przypisań → '0', czyli rola nie widzi niczego. Brak przypisań
 *              nigdy nie może degradować się do "widzi wszystko".
 */
export function makeProjectScopeCondition(
    columnExpr: string,
    scope?: ProjectScope
): string {
    if (!scope) return '1';
    if (scope.projectOurIds.length === 0) return '0';
    return mysql.format(`${columnExpr} IN (?)`, [scope.projectOurIds]);
}
