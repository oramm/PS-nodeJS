import MilestoneDateMailReport from '../contracts/milestones/cases/milestoneDate/MilestoneDateMailReport';

async function main() {
    try {
        console.log('Uruchamianie raportu terminów...');
        await MilestoneDateMailReport.sendOverdueAndUpcomingReport();
        console.log('Raport terminów wysłany pomyślnie');
        process.exit(0);
    } catch (error) {
        console.error('Błąd podczas wysyłania raportu:', error);
        process.exit(1);
    }
}

main();
// This script is intended to be run with Node.js and will send a report of overdue and upcoming milestone dates.
