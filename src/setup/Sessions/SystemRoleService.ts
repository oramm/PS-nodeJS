import PersonRepository from '../../persons/PersonRepository';

/**
 * Niskopoziomowy serwis do pobierania roli systemowej użytkownika.
 *
 * ARCHITEKTURA:
 * Ten serwis został wyodrębniony z PersonsController aby usunąć cykl zależności:
 * BaseController → ToolsGapi → PersonsController → BaseController
 *
 * Ten serwis jest używany przez ToolsGapi (warstwa infrastruktury) i NIE może
 * zależeć od żadnego Controllera (warstwa aplikacji).
 *
 * Przepływ zależności (prawidłowy):
 * ToolsGapi → SystemRoleService → PersonRepository → Person
 */
export default class SystemRoleService {
    private static repository = new PersonRepository();

    /**
     * Pobiera rolę systemową użytkownika na podstawie ID lub adresu email.
     *
     * @param params - Obiekt z id lub systemEmail użytkownika
     * @returns Obiekt z danymi roli systemowej lub undefined jeśli nie znaleziono
     */
    static async getSystemRole(params: { id?: number; systemEmail?: string }) {
        return this.repository.getSystemRole(params);
    }
}
