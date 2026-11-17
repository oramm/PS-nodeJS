import Setup from '../../../../setup/Setup';
import ToolsMail from '../../../../tools/ToolsMail';
import { MilestoneDateData } from '../../../../types/types';
import MilestoneDatesController from './MilestoneDatesController';

export default class MilestoneDateMailReport {
    /**
     * Generuje i wysyła raport terminów MilestoneDates do administratorów kontraktów
     * @param auth OAuth2Client do autoryzacji Google
     */
    static async sendOverdueAndUpcomingReport(): Promise<void> {
        try {
            console.log('Rozpoczynanie generowania raportu terminów...');

            // Pobierz wszystkie daty milestone z bazy danych
            const allMilestoneDates = await MilestoneDatesController.find([
                {
                    milestoneStatuses: [
                        Setup.MilestoneStatus.IN_PROGRESS,
                        Setup.MilestoneStatus.NOT_STARTED,
                    ],
                },
            ]);

            // Filtruj terminy przeterminowane i zbliżające się
            const { overdueDates, upcomingDates } =
                this.filterRelevantDates(allMilestoneDates);

            if (overdueDates.length === 0 && upcomingDates.length === 0) {
                console.log('Brak terminów do raportowania');
                return;
            }

            // Grupuj terminy według administratora kontraktu
            const groupedByAdmin = this.groupDatesByAdmin([
                ...overdueDates,
                ...upcomingDates,
            ]);

            // Wyślij e-maile do każdego administratora
            for (const [adminEmail, dates] of groupedByAdmin.entries()) {
                const adminOverdue = dates.filter((date) =>
                    overdueDates.some((od) => od.id === date.id)
                );
                const adminUpcoming = dates.filter((date) =>
                    upcomingDates.some((ud) => ud.id === date.id)
                );

                await this.sendEmailToAdmin(
                    adminEmail,
                    adminOverdue,
                    adminUpcoming
                );
            }

            console.log(
                `Raport wysłany do ${groupedByAdmin.size} administratorów`
            );
        } catch (error) {
            console.error('Błąd podczas generowania raportu terminów:', error);
            throw error;
        }
    }

    /**
     * Filtruje terminy na przeterminowane i zbliżające się (do 7 dni)
     */
    private static filterRelevantDates(allDates: MilestoneDateData[]): {
        overdueDates: MilestoneDateData[];
        upcomingDates: MilestoneDateData[];
    } {
        // SQL DATE is a calendar day. Compare UTC day numbers, not local clock time.
        const today = this.utcDay(new Date());
        const sevenDaysFromNow = today + 7;

        const overdueDates: MilestoneDateData[] = [];
        const upcomingDates: MilestoneDateData[] = [];

        for (const milestoneDate of allDates) {
            if (!milestoneDate.endDate) continue;
            const endDate = this.utcDay(milestoneDate.endDate);

            // Sprawdź czy termin minął
            if (endDate < today) {
                overdueDates.push(milestoneDate);
            }
            // Sprawdź czy termin zbliża się (w ciągu 7 dni)
            else if (endDate >= today && endDate <= sevenDaysFromNow) {
                upcomingDates.push(milestoneDate);
            }
        }

        return { overdueDates, upcomingDates };
    }

    /**
     * Grupuje terminy według adresu e-mail administratora kontraktu
     */
    private static groupDatesByAdmin(
        dates: MilestoneDateData[]
    ): Map<string, MilestoneDateData[]> {
        const groupedDates = new Map<string, MilestoneDateData[]>();

        for (const date of dates) {
            const adminEmail = this.getAdminEmail(date);
            if (!adminEmail) continue;

            if (!groupedDates.has(adminEmail)) {
                groupedDates.set(adminEmail, []);
            }
            groupedDates.get(adminEmail)!.push(date);
        }

        return groupedDates;
    }

    /**
     * Pobiera adres e-mail administratora z danych milestone
     */
    private static getAdminEmail(
        milestoneDate: MilestoneDateData
    ): string | null {
        const contract = milestoneDate._milestone?._contract;
        if (!contract) return null;

        // Sprawdź czy to jest OurContractData i czy ma administratora
        if ('_admin' in contract && contract._admin?.email) {
            return contract._admin.email;
        }

        // Sprawdź czy to jest OtherContractData i czy ma powiązany kontrakt z administratorem
        if (
            '_ourContract' in contract &&
            contract._ourContract?._admin?.email
        ) {
            return contract._ourContract._admin.email;
        }

        return null;
    }

    /**
     * Wysyła e-mail z raportem do konkretnego administratora
     */
    private static async sendEmailToAdmin(
        adminEmail: string,
        overdueDates: MilestoneDateData[],
        upcomingDates: MilestoneDateData[]
    ): Promise<void> {
        const subject = 'Raport terminów - Kamienie milowe';
        const htmlContent = this.generateEmailContent(
            overdueDates,
            upcomingDates
        );
        const textContent = this.generateTextContent(
            overdueDates,
            upcomingDates
        );

        try {
            await ToolsMail.sendMail({
                to: adminEmail,
                subject,
                html: htmlContent,
                text: textContent,
            });

            console.log(`E-mail wysłany do: ${adminEmail}`);
        } catch (error) {
            console.error(`Błąd wysyłania e-maila do ${adminEmail}:`, error);
            throw error;
        }
    }

    /**
     * Generuje zawartość HTML e-maila
     */
    private static generateEmailContent(
        overdueDates: MilestoneDateData[],
        upcomingDates: MilestoneDateData[]
    ): string {
        let html = '<h2>Raport terminów - Kamienie milowe</h2>';

        if (overdueDates.length > 0) {
            html += '<h3 style="color: #d32f2f;">🔴 Termin minął</h3>';
            html +=
                '<table border="1" style="border-collapse: collapse; width: 100%; margin-bottom: 20px;">';
            html += '<tr style="background-color: #f5f5f5;">';
            html += '<th style="padding: 8px; text-align: left;">Kontrakt</th>';
            html +=
                '<th style="padding: 8px; text-align: left;">Kamień milowy</th>';
            html +=
                '<th style="padding: 8px; text-align: left;">Termin końcowy</th>';
            html +=
                '<th style="padding: 8px; text-align: left;">Dni opóźnienia</th>';
            html += '<th style="padding: 8px; text-align: left;">Opis</th>';
            html += '</tr>';

            for (const date of overdueDates) {
                const daysOverdue = this.calculateDaysOverdue(date.endDate);
                html += '<tr>';
                html += `<td style="padding: 8px;">${this.getContractInfo(
                    date
                )}</td>`;
                html += `<td style="padding: 8px;">${this.getMilestoneInfo(
                    date
                )}</td>`;
                html += `<td style="padding: 8px; color: #d32f2f;">${MilestoneDateMailReport.formatDate(
                    date.endDate
                )}</td>`;
                html += `<td style="padding: 8px; color: #d32f2f; font-weight: bold;">${daysOverdue}</td>`;
                html += `<td style="padding: 8px;">${
                    date.description || '-'
                }</td>`;
                html += '</tr>';
            }
            html += '</table>';
        }

        if (upcomingDates.length > 0) {
            html +=
                '<h3 style="color: #ff9800;">⚠️ Terminy zbliżające się (do 7 dni)</h3>';
            html +=
                '<table border="1" style="border-collapse: collapse; width: 100%;">';
            html += '<tr style="background-color: #f5f5f5;">';
            html += '<th style="padding: 8px; text-align: left;">Kontrakt</th>';
            html +=
                '<th style="padding: 8px; text-align: left;">Kamień milowy</th>';
            html +=
                '<th style="padding: 8px; text-align: left;">Termin końcowy</th>';
            html +=
                '<th style="padding: 8px; text-align: left;">Dni pozostało</th>';
            html += '<th style="padding: 8px; text-align: left;">Opis</th>';
            html += '</tr>';

            for (const date of upcomingDates) {
                const daysRemaining = this.calculateDaysRemaining(date.endDate);
                html += '<tr>';
                html += `<td style="padding: 8px;">${this.getContractInfo(
                    date
                )}</td>`;
                html += `<td style="padding: 8px;">${this.getMilestoneInfo(
                    date
                )}</td>`;
                html += `<td style="padding: 8px; color: #ff9800;">${MilestoneDateMailReport.formatDate(
                    date.endDate
                )}</td>`;
                html += `<td style="padding: 8px; color: #ff9800; font-weight: bold;">${daysRemaining}</td>`;
                html += `<td style="padding: 8px;">${
                    date.description || '-'
                }</td>`;
                html += '</tr>';
            }
            html += '</table>';
        }

        html +=
            '<br><p><em>Raport wygenerowany automatycznie przez system ERP ENVI</em></p>';

        return html;
    }

    /**
     * Generuje zawartość tekstową e-maila
     */
    private static generateTextContent(
        overdueDates: MilestoneDateData[],
        upcomingDates: MilestoneDateData[]
    ): string {
        let text = 'RAPORT TERMINÓW - KAMIENIE MILOWE\n\n';

        if (overdueDates.length > 0) {
            text += 'TERMINY PRZETERMINOWANE:\n';
            text += '========================\n';

            for (const date of overdueDates) {
                const daysOverdue = this.calculateDaysOverdue(date.endDate);
                text += `• ${this.getContractInfo(
                    date
                )} - ${this.getMilestoneInfo(date)}\n`;
                text += `  Termin: ${MilestoneDateMailReport.formatDate(
                    date.endDate
                )} (${daysOverdue} dni opóźnienia)\n`;
                if (date.description) {
                    text += `  Opis: ${date.description}\n`;
                }
                text += '\n';
            }
        }

        if (upcomingDates.length > 0) {
            text += 'TERMINY ZBLIŻAJĄCE SIĘ (do 7 dni):\n';
            text += '==================================\n';

            for (const date of upcomingDates) {
                const daysRemaining = this.calculateDaysRemaining(date.endDate);
                text += `• ${this.getContractInfo(
                    date
                )} - ${this.getMilestoneInfo(date)}\n`;
                text += `  Termin: ${MilestoneDateMailReport.formatDate(
                    date.endDate
                )} (${daysRemaining} dni pozostało)\n`;
                if (date.description) {
                    text += `  Opis: ${date.description}\n`;
                }
                text += '\n';
            }
        }

        text += '\nRaport wygenerowany automatycznie przez system ERP ENVI';

        return text;
    }

    /**
     * Pobiera informacje o kontrakcie
     */
    private static getContractInfo(milestoneDate: MilestoneDateData): string {
        const contract = milestoneDate._milestone?._contract;
        if (!contract) return 'Nieznany kontrakt';

        // Sprawdź czy to jest OurContractData i ma ourId
        let contractNumber = contract.number;
        if ('ourId' in contract && contract.ourId) {
            contractNumber = contractNumber || contract.ourId;
        }

        contractNumber = contractNumber || 'Brak numeru';
        const contractName = contract.name || contract.alias || '';

        return contractName
            ? `${contractNumber} - ${contractName}`
            : contractNumber;
    }

    /**
     * Pobiera informacje o kamieniu milowym
     */
    private static getMilestoneInfo(milestoneDate: MilestoneDateData): string {
        const milestone = milestoneDate._milestone;
        if (!milestone) return 'Nieznany kamień milowy';

        const typeName = milestone._type?.name || 'Nieznany typ';
        const milestoneName = milestone.name || '';

        return milestoneName ? `${typeName} - ${milestoneName}` : typeName;
    }

    /**
     * Formatuje datę z formatu SQL (YYYY-MM-DD) na format DD-MM-YYYY
     */
    private static formatDate(sqlDate: string): string {
        if (!sqlDate) return 'Brak daty';

        try {
            const date = new Date(sqlDate);
            return date.toLocaleDateString('pl-PL', { timeZone: 'UTC' });
        } catch {
            return sqlDate;
        }
    }

    /**
     * Oblicza liczbę dni opóźnienia
     */
    private static utcDay(value: string | Date): number {
        const date = value instanceof Date ? value : new Date(value);
        return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86400000;
    }
    private static calculateDaysOverdue(endDate: string): number {
        return this.utcDay(new Date()) - this.utcDay(endDate);
    }

    /**
     * Oblicza liczbę dni pozostałych do terminu
     */
    private static calculateDaysRemaining(endDate: string): number {
        return this.utcDay(endDate) - this.utcDay(new Date());
    }
}
