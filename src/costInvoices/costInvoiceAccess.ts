import { SystemRoleName } from '../types/sessionTypes';
import StaffMemberRepository from '../staff/StaffMemberRepository';
import ToolsDb from '../tools/ToolsDb';

/**
 * Jedna reguła dostępu do faktur kosztowych dla bramki modułu, menu i mapy dostępów agenta.
 * Decyzja właściciela 2026-11-19 (AGD K2): widzą ADMIN, ENVI_MANAGER i opiekun kontraktu ENVI
 * (OurContractsData.ManagerId); znacznik HasCostInvoiceAccess zostaje dla pozostałych (np. księgowość).
 * Opiekunstwo liczy się tylko pracownikowi ENVI (ENVI_EMPLOYEE): role zakresowe (kontraktowy,
 * klient, współpracownik, zewnętrzny) nie dostają poufnych faktur przez sam wpis jako opiekun.
 */
export async function hasCostInvoiceModuleAccess(
    personId: number,
    roleName: string | null | undefined,
): Promise<boolean> {
    if (roleName === SystemRoleName.ADMIN) return true;
    if (roleName === SystemRoleName.ENVI_MANAGER) return true;
    if (await StaffMemberRepository.hasCostInvoiceAccess(personId)) return true;
    if (roleName !== SystemRoleName.ENVI_EMPLOYEE) return false;
    const rows = (await ToolsDb.getQueryCallbackAsync(
        'SELECT 1 FROM OurContractsData WHERE ManagerId = ? LIMIT 1',
        undefined,
        [personId],
    )) as unknown[];
    return rows.length > 0;
}
