console.log('Initializing minimal environment...');

// Tylko podstawowe inicjalizacje - bez routerów!
import { loadEnv } from '../setup/loadEnv';
import ToolsDb from '../tools/ToolsDb';
loadEnv();

// Import typów wymaganych przez aplikację
import '../types/sessionTypes';

console.log('Environment initialized');
console.log('Importing MilestoneDateMailReport...');
import MilestoneDateMailReport from '../contracts/milestones/cases/milestoneDate/MilestoneDateMailReport';
console.log('Import successful!');

async function main() {
    try {
        console.log('Initialize DB pool…');
        ToolsDb.initialize(); // <-- TO jest kluczowe!
        console.log('Db time zone set to +00:00');
        console.log('Uruchamianie raportu terminów...');
        console.log('MilestoneDateMailReport:', MilestoneDateMailReport);
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
