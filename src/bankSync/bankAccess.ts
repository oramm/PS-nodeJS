import StaffMemberRepository from '../staff/StaffMemberRepository';
import { SystemRoleName, UserData } from '../types/sessionTypes';

/**
 * Dostęp do wyciągów bankowych i wpłat wynika z flagi StaffMembers.HasBankAccess, nie z roli
 * systemowej. Seed migracji nadał ją rolom 1 i 2, więc dla dotychczasowych użytkowników
 * nic się nie zmienia; nadanie jej komuś spoza tych ról nie wymaga podnoszenia roli,
 * a odebranie - obniżania jej.
 *
 * ADMIN wchodzi zawsze, niezależnie od flagi: pomyłkowe wyzerowanie kolumny nie może
 * odciąć wszystkim ścieżki naprawy.
 */
export async function hasBankModuleAccess(userData?: UserData): Promise<boolean> {
    if (!userData?.enviId) return false;
    if (userData.systemRoleName === SystemRoleName.ADMIN) return true;
    return StaffMemberRepository.hasBankAccess(userData.enviId);
}
