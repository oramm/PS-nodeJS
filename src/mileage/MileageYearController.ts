import { randomUUID, createHash } from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import ToolsDb from '../tools/ToolsDb';
import MileageYearRepository from './MileageYearRepository';
import MileageYearProvisioner from './MileageYearProvisioner';
import { mileageFileName, mileageYearConfig, MileageYear, MileageYearCar, MileageYearConfig, MileageYearError } from './MileageYear';

export default class MileageYearController {
    /** Explicit write-path preparation. GET callers must use find/mappings only. */
    static async ensureYear(auth: OAuth2Client, year: number, requestedCarId?: number, config = mileageYearConfig()): Promise<{year: MileageYear; mappings: MileageYearCar[]}> {
        return this.withYear(auth, year, requestedCarId, async prepared => prepared, config);
    }
    /** Advisory lock covers preparation, read, retry detection and the atomic trip batch. */
    static async withYear<T>(auth: OAuth2Client, year: number, requestedCarId: number | undefined, operation: (prepared: {year: MileageYear; mappings: MileageYearCar[]}) => Promise<T>, config = mileageYearConfig()): Promise<T> {
        mileageFileName(year,config);
        const connection = await ToolsDb.getPoolConnectionWithTimeout();
        const repository = new MileageYearRepository(connection);
        const provisioner = new MileageYearProvisioner(auth);
        let lockName: string | undefined;
        try {
            const database = await repository.database();
            lockName = `mileage:${createHash('sha256').update(`${database}:${config.folderId}`).digest('hex').slice(0,48)}`;
            if (!await repository.acquireLock(lockName)) { lockName=undefined; throw new MileageYearError('MILEAGE_BUSY','Przygotowanie kilometrówki trwa. Spróbuj ponownie.'); }
            const persist = async (action:()=>Promise<void>) => {
                await connection.beginTransaction();
                try { await action(); await connection.commit(); } catch(error) { await connection.rollback(); throw error; }
            };
            const prepared = await this.prepare(repository,provisioner,persist,year,requestedCarId,config);
            return await operation(prepared);
        } finally {
            try { if (lockName) await repository.releaseLock(lockName); } finally { connection.release(); }
        }
    }
    static async prepare(repository: MileageYearRepository, provisioner: MileageYearProvisioner, persist: (action:()=>Promise<void>)=>Promise<void>, year: number, requestedCarId: number | undefined, config: MileageYearConfig): Promise<{year:MileageYear;mappings:MileageYearCar[]}> {
        mileageFileName(year,config);
        const cars = await repository.cars();
        if (!cars.length || (requestedCarId!==undefined && !cars.some(car=>car.Id===requestedCarId))) throw new MileageYearError('CAR_NOT_FOUND','Nieznany pojazd kilometrówki.');
        let seed = await repository.find(config.seedYear);
        if (!seed) {
            const legacyCars = cars.filter(car=>car.MileageSpreadsheetId!==null || car.MileageSheetGid!==null);
            if (!legacyCars.length || legacyCars.some(car=>car.MileageSpreadsheetId!==config.seedSpreadsheetId || car.MileageSheetGid===null) || new Set(legacyCars.map(car=>car.MileageSheetGid)).size!==legacyCars.length)
                throw new MileageYearError('SEED_MAPPING_CONFLICT','Mapowania Cars nie odpowiadają dokładnie skonfigurowanemu plikowi początkowemu. Zweryfikuj je przed przygotowaniem kilometrówki.');
            seed = {Year:config.seedYear,SpreadsheetId:config.seedSpreadsheetId,FolderId:config.folderId,FileName:mileageFileName(config.seedYear,config),OperationId:randomUUID(),State:'READY',SourceYear:null};
            const mappings = legacyCars.map(car=>({Year:config.seedYear,CarId:car.Id,SheetGid:Number(car.MileageSheetGid),PlateSnapshot:car.LicensePlateNumber}));
            await provisioner.assertFile(seed,false);
            const seedCandidates = await provisioner.candidates(seed);
            if(seedCandidates.length!==1 || seedCandidates[0]!==seed.SpreadsheetId) throw new MileageYearError('FILE_CONFLICT','Niejednoznaczny plik roku początkowego.');
            await provisioner.verifyMappings(seed,mappings,false,true);
            await persist(async()=>{await repository.add(seed!); for(const mapping of mappings) await repository.addMapping(mapping);});
        }
        if (seed.SpreadsheetId!==config.seedSpreadsheetId || seed.FolderId!==config.folderId || seed.FileName!==mileageFileName(config.seedYear,config)) throw new MileageYearError('CONFIG_CONFLICT','Konfiguracja jest niezgodna z zapamiętanym rokiem początkowym.');
        let record = await repository.find(year);
        if (record && (record.FolderId!==config.folderId || record.FileName!==mileageFileName(year,config))) throw new MileageYearError('CONFIG_CONFLICT','Konfiguracja jest niezgodna z zapamiętanym plikiem rocznym.');
        const source = year===config.seedYear ? seed : await repository.find(year-1);
        if (!source || source.State!=='READY') throw new MileageYearError('PREVIOUS_YEAR_REQUIRED','Najpierw przygotuj i zweryfikuj poprzedni rok kilometrówki.');
        await provisioner.assertFile(source,source.SourceYear!==null);
        const sourceCandidates=await provisioner.candidates(source);
        if(sourceCandidates.length!==1 || sourceCandidates[0]!==source.SpreadsheetId) throw new MileageYearError('FILE_CONFLICT','Niejednoznaczny plik poprzedniego roku.');
        const sourceMappings = await repository.mappings(source.Year);
        if (!record) {
            record = {Year:year,SpreadsheetId:null,FolderId:config.folderId,FileName:mileageFileName(year,config),OperationId:randomUUID(),State:'PLANNED',SourceYear:source.Year};
            await repository.add(record);
        }
        let mappings = await repository.mappings(year);
        if (record.State==='READY') {
            const readyCandidates = await provisioner.candidates(record);
            if (readyCandidates.length!==1 || readyCandidates[0]!==record.SpreadsheetId) throw new MileageYearError('FILE_CONFLICT','Niejednoznaczny plik roczny. Sprawdź folder kilometrówki.');
            await provisioner.assertFile(record,record.SourceYear!==null);
            await provisioner.verifyMappings(record,mappings,false);
            if (requestedCarId===undefined || mappings.some(mapping=>mapping.CarId===requestedCarId)) return {year:record,mappings};
            // A new car receives a tab only on its first write, not on a read.
            const completed = await provisioner.prepare(record,cars.filter(car=>car.Id===requestedCarId),mappings,source,sourceMappings);
            await persist(async()=>{for(const mapping of completed.filter(m=>!mappings.some(old=>old.CarId===m.CarId))) await repository.addMapping(mapping);});
            return {year:record,mappings:completed};
        }
        const candidates = await provisioner.candidates(record);
        if (record.SpreadsheetId && (candidates.length!==1 || candidates[0]!==record.SpreadsheetId)) throw new MileageYearError('FILE_CONFLICT','Plik operacji nie zgadza się z zawartością folderu.');
        if (!record.SpreadsheetId) {
            if (candidates.length) record.SpreadsheetId=candidates[0];
            else if (record.State==='CREATING') throw new MileageYearError('CREATE_OUTCOME_UNKNOWN','Nie potwierdzono wyniku utworzenia pliku. Sprawdź operację w Drive przed ponowieniem.');
            else {
                await repository.setState(year,'CREATING',null);
                record.State='CREATING';
                record.SpreadsheetId=await provisioner.create(record);
            }
            // Persist the ID before any Sheets write. A failed save is recovered via operation marker.
            await provisioner.assertFile(record,true);
            await repository.setState(year,'CREATING',record.SpreadsheetId);
            record.State='CREATING';
        }
        await provisioner.assertFile(record,true);
        mappings = await provisioner.prepare(record,cars,mappings,source,sourceMappings);
        await provisioner.verifyMappings(record,mappings,true);
        await persist(async()=>{const old=await repository.mappings(year);for(const mapping of mappings.filter(m=>!old.some(o=>o.CarId===m.CarId))) await repository.addMapping(mapping);await repository.setState(year,'READY',record!.SpreadsheetId);});
        record.State='READY';
        return {year:record,mappings};
    }
}
