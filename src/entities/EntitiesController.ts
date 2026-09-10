import mysql from 'mysql2/promise';
import Entity from './Entity';
import BaseController from '../controllers/BaseController';
import EntityRepository, { EntitiesSearchParams } from './EntityRepository';
import ToolsDb from '../tools/ToolsDb';
import {
    enqueueFidmanEntityPush,
    entityHasSyncedContract,
    tryDeliverAfterCommit as tryDeliverFidmanAfterCommit,
} from '../contracts/fidmanSync/FidmanSync';
import { isValidNipChecksum, normalizeNip } from '../contracts/aqmSync/AqmSync';
import GusBirService, {
    GusBirNotConfiguredError,
    GusBirNotFoundError,
} from './gusBir/GusBirService';
import {
    compareWithGus,
    GUS_ACCEPTABLE_FIELDS,
    GusAcceptableField,
    GusDifference,
    GusSnapshot,
    GusStatus,
} from './gusBir/GusCompare';

export type { EntitiesSearchParams };

/** Powód, dla którego sprawdzenia albo przyjęcia nie da się wykonać. Router tłumaczy go na kod HTTP. */
export type GusRefusalReason =
    | 'ENTITY_NOT_FOUND'
    | 'NO_USABLE_NIP'
    | 'GUS_NOT_CONFIGURED'
    | 'NO_SNAPSHOT'
    | 'NO_FIELDS';

export type GusRefusal = {
    ok: false;
    reason: GusRefusalReason;
    message: string;
};

export type GusCheckResult =
    | {
          ok: true;
          id: number;
          status: GusStatus;
          checkedAt: Date;
          snapshot: GusSnapshot | null;
          differences: GusDifference[];
      }
    | GusRefusal;

export type GusAcceptResult =
    | {
          ok: true;
          id: number;
          applied: GusAcceptableField[];
          status: GusStatus;
          differences: GusDifference[];
      }
    | GusRefusal;

/** Dane podmiotu przyjmowane z formularza przy dodawaniu i edycji. */
type EntityWriteData = {
    name?: string;
    shortName?: string;
    address?: string;
    taxNumber?: string | null;
    regon?: string;
    krs?: string;
    www?: string;
    email?: string;
    phone?: string;
};

/**
 * GUS-1 / D-GUS-5 — NIP wchodzi do zapisu zawsze jako 10 cyfr.
 *
 * Powód: TaxNumber ma klucz unikalny, a mimo to 4 pary podmiotów na produkcji dzielą (odczyt 2026-09-09)
 * ten sam NIP — jeden wpisano z myślnikami, drugi bez, więc dla bazy to dwa różne
 * teksty. Bez normalizacji na wejściu REGON i KRS zdublują się tak samo.
 *
 * Normalizujemy WYŁĄCZNIE wtedy, gdy po odrzuceniu znaków niebędących cyframi zostaje
 * dokładnie 10 cyfr. Gołe `replace(/\D/g,'')` zamieniłoby zagraniczny numer „FR-123-XYZ"
 * na „123", czyli skasowałoby dane podmiotu, który z polskim NIP-em nie ma nic wspólnego.
 * Numer, którego nie da się odczytać jako polskiego NIP-u, zostaje dokładnie taki, jaki był.
 *
 * Brak NIP-u zostaje brakiem: undefined i pusty tekst przechodzą nietknięte, nigdy nie
 * zamieniają się w ''.
 *
 * Normalizacja nie ma wpływu na bramkę isValidNipChecksum w editEntity — ta i tak
 * normalizuje sobie wejście sama, więc podmioty niebędące stroną umowy synchronizowanej
 * z FIDmanem edytują się dokładnie jak dotąd.
 */
function withNormalizedNip<T extends EntityWriteData>(entityData: T): T {
    if (!entityData?.taxNumber) return entityData;
    const digits = normalizeNip(entityData.taxNumber);
    if (digits.length !== 10) return entityData;
    return { ...entityData, taxNumber: digits };
}

/** REG-1 / D-REG-1: numery podmiotu, ktore da sie z formularza skasowac. */
const CLEARABLE_NUMBERS = ['taxNumber', 'regon', 'krs'] as const;

/**
 * REG-1 / D-REG-1 — o skasowanie KTORYCH numerów prosi formularz.
 *
 * Trzeba odróżnić dwie różne rzeczy, które konstruktor Entity zwija do jednej: pole
 * puste („skasuj numer") i pole w ogóle niepodane („nie ruszaj"). Bez tego rozróżnienia
 * trasa edycji odpowiadała, że numer wyczyściła, a w bazie zostawała stara wartość
 * (zmierzone na produkcji 2026-09-10 dla NIP-u, sesja GUS-5; REGON i KRS miały tę samą wadę).
 *
 * Jedna reguła na trzy numery, nie trzy bliźniacze funkcje (D-REG-1) — trzy kopie tej samej
 * myśli rozjechałyby się przy pierwszej zmianie. Lista jest zamknięta celowo: nazwa, adres
 * i telefon mają dziś inne zachowanie i nie zmieniamy go przy okazji.
 */
function numbersAskedToClear(
    entityData: EntityWriteData
): (typeof CLEARABLE_NUMBERS)[number][] {
    return CLEARABLE_NUMBERS.filter(
        (field) =>
            entityData?.[field] !== undefined &&
            String(entityData[field] ?? '').trim() === ''
    );
}

export default class EntitiesController extends BaseController<
    Entity,
    EntityRepository
> {
    private static instance: EntitiesController;

    constructor() {
        super(new EntityRepository());
    }

    private static getInstance(): EntitiesController {
        if (!this.instance) {
            this.instance = new EntitiesController();
        }
        return this.instance;
    }

    // ==================== READ (bez auth) ====================
    /**
     * Wyszukuje encje według parametrów
     * @param searchParams - Parametry wyszukiwania
     * @returns Promise<Entity[]> - Lista encji
     */
    static async find(
        searchParams: EntitiesSearchParams[] = []
    ): Promise<Entity[]> {
        const instance = this.getInstance();
        return await instance.repository.find(searchParams);
    }

    // ==================== GUS: sprawdzenie i przyjęcie ====================
    /**
     * GUS-2 — pyta rejestr GUS o jeden podmiot, porównuje odpowiedź z tym, co jest w PS,
     * i zapisuje sam werdykt.
     *
     * D-GUS-1: nazwa, adres, REGON i KRS podmiotu NIE są tu dotykane, choćby GUS podawał
     * co innego. Zmienia je dopiero człowiek, trasą /gus/accept. Zapis idzie wąską
     * instrukcją EntityRepository.updateGusResult, która wymienia z nazwy tylko trzy
     * kolumny wyniku porównania.
     *
     * Awaria GUS-u (sieć, przerwa w usłudze) kończy się statusem ERROR i niczym więcej —
     * fail-open, tak samo jak w Białej liście KAS: zewnętrzny rejestr nie ma prawa
     * zepsuć rekordu w PS. Poprzednia migawka zostaje wtedy nietknięta.
     *
     * Brak klucza GUS to nie jest awaria rejestru, tylko brak konfiguracji, dlatego nie
     * zapisuje ERROR-a: cały słownik dostałby fałszywy stan przez jedną pustą zmienną.
     */
    static async gusCheck(id: number): Promise<GusCheckResult> {
        const instance = this.getInstance();
        const entity = (await instance.repository.find([{ id }]))[0];
        if (!entity)
            return {
                ok: false,
                reason: 'ENTITY_NOT_FOUND',
                message: `Nie ma podmiotu o numerze ${id}`,
            };

        const nip = normalizeNip(entity.taxNumber);
        if (!isValidNipChecksum(nip))
            return {
                ok: false,
                reason: 'NO_USABLE_NIP',
                message: entity.taxNumber
                    ? `Podmiot „${entity.name}" ma wpisany numer „${entity.taxNumber}", którego nie da się odczytać jako polskiego NIP-u. GUS wyszukuje wyłącznie po poprawnym NIP-ie, więc nie ma o co zapytać.`
                    : `Podmiot „${entity.name}" nie ma NIP-u. GUS wyszukuje wyłącznie po numerze, więc nie ma o co zapytać.`,
            };

        if (!GusBirService.isConfigured())
            return {
                ok: false,
                reason: 'GUS_NOT_CONFIGURED',
                message:
                    'Wyszukiwanie GUS nie jest skonfigurowane (brak GUS_BIR_KEY)',
            };

        const checkedAt = new Date();
        try {
            const found = await GusBirService.lookupByNip(nip);
            const snapshot: GusSnapshot = {
                name: found.name,
                address: found.address,
                regon: found.regon,
                krs: found.krs,
                closedAt: found.closedAt,
            };
            const { status, differences } = compareWithGus(entity, snapshot);
            await instance.repository.updateGusResult(id, {
                status,
                checkedAt,
                snapshot,
            });
            return { ok: true, id, status, checkedAt, snapshot, differences };
        } catch (error) {
            if (error instanceof GusBirNotConfiguredError)
                return {
                    ok: false,
                    reason: 'GUS_NOT_CONFIGURED',
                    message: error.message,
                };
            if (error instanceof GusBirNotFoundError) {
                // Rejestr nie zna tego NIP-u — stara migawka jest nieaktualna, więc znika.
                await instance.repository.updateGusResult(id, {
                    status: 'NOT_FOUND',
                    checkedAt,
                    snapshot: null,
                });
                return {
                    ok: true,
                    id,
                    status: 'NOT_FOUND',
                    checkedAt,
                    snapshot: null,
                    differences: [],
                };
            }
            console.error('[GusCheck] awaria zapytania do GUS:', error);
            // Fail-open: sam status, migawka bez zmian (pominięta w instrukcji UPDATE).
            await instance.repository.updateGusResult(id, {
                status: 'ERROR',
                checkedAt,
            });
            return {
                ok: true,
                id,
                status: 'ERROR',
                checkedAt,
                snapshot: entity.gusSnapshot ?? null,
                differences: [],
            };
        }
    }

    /**
     * GUS-2 / D-GUS-1 — przepisuje z zapisanej migawki WYŁĄCZNIE pola wskazane w żądaniu.
     * To jedyna droga, którą dane z GUS wchodzą do podmiotu.
     *
     * Status po przyjęciu nie jest wpisywany na sztywno, tylko liczony jeszcze raz dla
     * rekordu po zmianie. Człowiek może przyjąć samą nazwę i zostawić adres celowo inny
     * (korespondencyjny, oddział) — wtedy rekord dalej różni się od rejestru i status ma
     * to mówić. Przy pełnym przyjęciu wychodzi z tego OK. Zakończona działalność zostaje
     * zakończoną działalnością niezależnie od tego, co przyjęto.
     *
     * GUS-4a — PRZYJĘCIE ZASILA KOLEJKĘ SYNCHRONIZACJI Z FIDmanem. Zapis idzie wąską
     * instrukcją i omija editEntity, więc bez tego przyjęcie nazwy albo adresu dla
     * podmiotu będącego stroną umowy synchronizowanej z FIDmanem nigdy by tam nie
     * dojechało. Wzorzec ten sam co w editEntity (SYNC-P1): wiersz kolejki w TEJ SAMEJ
     * transakcji co zapis, wysyłka ściśle po commicie, a jej awaria nie ma prawa
     * wywrócić przyjęcia.
     */
    static async gusAccept(
        id: number,
        fields: GusAcceptableField[]
    ): Promise<GusAcceptResult> {
        const instance = this.getInstance();
        const entity = (await instance.repository.find([{ id }]))[0];
        if (!entity)
            return {
                ok: false,
                reason: 'ENTITY_NOT_FOUND',
                message: `Nie ma podmiotu o numerze ${id}`,
            };

        const snapshot = entity.gusSnapshot;
        if (!snapshot)
            return {
                ok: false,
                reason: 'NO_SNAPSHOT',
                message: `Podmiot „${entity.name}" nie ma zapisanej odpowiedzi z GUS — najpierw sprawdź go w rejestrze, potem przyjmuj.`,
            };

        const values: Partial<Record<GusAcceptableField, string>> = {};
        for (const field of GUS_ACCEPTABLE_FIELDS) {
            if (!fields.includes(field)) continue;
            const value = String(snapshot[field] ?? '').trim();
            // Rejestr nie podał tej wartości — przyjęcie pustki skasowałoby dane z PS.
            if (!value) continue;
            values[field] = value;
        }

        const applied = Object.keys(values) as GusAcceptableField[];
        if (applied.length === 0)
            return {
                ok: false,
                reason: 'NO_FIELDS',
                message:
                    'Nie wskazano żadnego pola do przyjęcia albo GUS nie podał dla wskazanych pól żadnej wartości.',
            };

        const afterAccept = {
            name: entity.name,
            address: entity.address,
            regon: entity.regon,
            krs: entity.krs,
            ...values,
        };
        const { status, differences } = compareWithGus(afterAccept, snapshot);

        // Do FIDmana idzie tylko nazwa i adres. REGON i KRS są po stronie FIDmana
        // polem własnym i synchronizacja ich nie przenosi, więc przyjęcie samego REGON-u
        // nie ma czego tam wysłać.
        //
        // Bramki NIP-u z editEntity tu NIE MA i być nie może: accept nie zmienia NIP-u,
        // więc podmiot, który ma w PS numer nie do odczytania, ma się dalej zapisywać
        // dokładnie tak jak dotąd — inaczej ta zmiana zablokowałaby przyjęcie danych
        // rekordom, które najbardziej ich potrzebują.
        const goesToFidman =
            applied.includes('name') || applied.includes('address');
        let fidmanOutboxId: number | undefined;

        await ToolsDb.transaction(async (conn: mysql.PoolConnection) => {
            await instance.repository.applyGusValues(id, values, status, conn);
            if (!goesToFidman) return;
            if (!(await entityHasSyncedContract(id, conn))) return;
            // Do kolejki idzie podmiot JUŻ po przyjęciu — stąd przyjęte wartości
            // nałożone na odczytany rekord.
            Object.assign(entity, values);
            fidmanOutboxId = await enqueueFidmanEntityPush(entity, conn);
        });

        if (fidmanOutboxId !== undefined)
            await tryDeliverFidmanAfterCommit(fidmanOutboxId).catch((err) =>
                console.error(
                    '[FidmanSync] post-commit push (gus accept) error:',
                    err
                )
            );

        return { ok: true, id, applied, status, differences };
    }

    // ==================== CREATE ====================
    /**
     * API PUBLICZNE
     * Dodaje nową encję do systemu
     *
     * @param entityData - Dane encji do dodania
     * @returns Promise<Entity> - Dodana encja
     */
    static async add(
        entityData: EntityWriteData & { name: string }
    ): Promise<Entity> {
        const instance = this.getInstance();
        return await instance.addEntity(entityData);
    }

    /**
     * LOGIKA BIZNESOWA (prywatna)
     * Dodaje encję do DB
     *
     * @param entityData - Dane encji do dodania
     * @returns Promise<Entity> - Dodana encja
     */
    private async addEntity(
        entityData: EntityWriteData & { name: string }
    ): Promise<Entity> {
        console.group('EntitiesController.addEntity()');
        try {
            const entity = new Entity(withNormalizedNip(entityData));
            // SYNC-P3: no NIP guard here — a brand-new entity has no id yet, so it
            // cannot already be a party of a contract (associations only reference
            // existing entity ids, see ContractEntityController.addAssociations).
            // entityHasSyncedContract() would always be false at this point; the
            // guard only has bite on editEntity below.
            if (entity.shortName) {
                const duplicate = await this.repository.find([
                    { shortName: entity.shortName },
                ]);
                if (duplicate.length > 0)
                    throw new Error(
                        `Skrócona nazwa "${entity.shortName}" jest już zajęta`
                    );
            }
            try {
                await this.create(entity);
            } catch (err: any) {
                if (err.code === 'ER_DUP_ENTRY')
                    throw new Error(
                        `Skrócona nazwa "${entity.shortName}" jest już zajęta`
                    );
                throw err;
            }
            console.log(`Entity ${entity.name} added in db`);
            return entity;
        } finally {
            console.groupEnd();
        }
    }

    // ==================== UPDATE ====================
    /**
     * API PUBLICZNE
     * Aktualizuje istniejącą encję
     *
     * @param entityData - Dane encji do aktualizacji
     * @returns Promise<Entity> - Zaktualizowana encja
     */
    static async edit(
        entityData: EntityWriteData & { id: number }
    ): Promise<Entity> {
        const instance = this.getInstance();
        return await instance.editEntity(entityData);
    }

    /**
     * LOGIKA BIZNESOWA (prywatna)
     * Edytuje encję w DB
     *
     * @param entityData - Dane encji do aktualizacji
     * @returns Promise<Entity> - Zaktualizowana encja
     */
    private async editEntity(
        entityData: EntityWriteData & { id: number }
    ): Promise<Entity> {
        console.group('EntitiesController.editEntity()');
        try {
            const entity = new Entity(withNormalizedNip(entityData));
            // REG-1 / D-REG-2: puste pole numeru kasuje kolumnę wprost, wartością pustą
            // w sensie bazy (`null`), a nie pustym tekstem. Bramka FIDmana niżej i tak nie
            // wypuści zapisu bez NIP-u dla strony umowy synchronizowanej.
            for (const field of numbersAskedToClear(entityData))
                entity[field] = null;
            if (entity.shortName) {
                const duplicate = await this.repository.find([
                    { shortName: entity.shortName },
                ]);
                if (duplicate.length > 0 && duplicate[0].id !== entity.id)
                    throw new Error(
                        `Skrócona nazwa "${entity.shortName}" jest już zajęta`
                    );
            }
            // SYNC-P1: wpis do FidmanSyncOutbox w TEJ SAMEJ transakcji co edycja
            // encji (L8), tylko gdy encja jest stroną ≥1 umowy typu FIDman.
            let fidmanOutboxId: number | undefined;
            try {
                await ToolsDb.transaction(
                    async (conn: mysql.PoolConnection) => {
                        const isSyncParty = await entityHasSyncedContract(
                            entity.id,
                            conn
                        );
                        // SYNC-P3: entities that are already a party of a synced-type
                        // contract must carry a NIP that passes format+checksum — it
                        // is FIDman's dedup/link key (legacy_id -> normalized NIP).
                        // Non-sync-party entities are untouched: no format requirement,
                        // so editing foreign/legacy counterparts that never sync keeps
                        // working exactly as before.
                        if (isSyncParty && !isValidNipChecksum(entity.taxNumber)) {
                            throw new Error(
                                `Podmiot "${entity.name ?? entity.id}" jest stroną zsynchronizowanej z FIDman umowy — wymagany prawidłowy NIP (10 cyfr, poprawna suma kontrolna).`
                            );
                        }
                        await this.repository.editInDb(entity, conn, true, [
                            'name',
                            'shortName',
                            'address',
                            'taxNumber',
                            'regon',
                            'krs',
                            'www',
                            'email',
                            'phone',
                        ]);
                        if (isSyncParty) {
                            fidmanOutboxId = await enqueueFidmanEntityPush(
                                entity,
                                conn
                            );
                        }
                    }
                );
            } catch (err: any) {
                if (err.code === 'ER_DUP_ENTRY')
                    throw new Error(
                        `Skrócona nazwa "${entity.shortName}" jest już zajęta`
                    );
                throw err;
            }
            console.log(`Entity ${entity.name} updated in db`);

            // SYNC-P1: push STRICTLY post-commit; awaria nigdy nie rolbackuje
            // ani nie wychodzi z edycji encji (L8).
            if (fidmanOutboxId !== undefined) {
                await tryDeliverFidmanAfterCommit(fidmanOutboxId).catch((err) =>
                    console.error(
                        '[FidmanSync] post-commit push (entity edit) error:',
                        err
                    )
                );
            }
            // GPO-2 / D-GPO-3: odpowiedź jest ODCZYTEM PO ZAPISIE, nie powtórzeniem
            // formularza. Formularz mówi, o co poproszono; baza mówi, co się stało —
            // a to nie zawsze jest to samo (defekt z GUS-5 polegał dokładnie na tym).
            // Gdyby rekord w międzyczasie zniknął, wraca to, co zapisywaliśmy.
            const saved = (await this.repository.find([{ id: entity.id }]))[0];
            return saved ?? entity;
        } finally {
            console.groupEnd();
        }
    }

    // ==================== DELETE ====================
    /**
     * API PUBLICZNE
     * Usuwa encję z systemu
     *
     * @param entityData - Dane encji do usunięcia
     * @returns Promise<void>
     */
    static async delete(entityData: Entity): Promise<void> {
        const instance = this.getInstance();
        return await instance.deleteEntity(entityData);
    }

    /**
     * LOGIKA BIZNESOWA (prywatna)
     * Usuwa encję z DB
     *
     * @param entityData - Dane encji do usunięcia
     * @returns Promise<void>
     */
    private async deleteEntity(entityData: Entity): Promise<void> {
        console.group('EntitiesController.deleteEntity()');
        try {
            const entity = new Entity(entityData);
            await this.repository.deleteFromDb(entity);
            console.log(`Entity with id ${entity.id} deleted from db`);
        } finally {
            console.groupEnd();
        }
    }

    // ==================== DEPRECATED (dla kompatybilności wstecznej) ====================
    /**
     * @deprecated Użyj EntitiesController.add(entityData) zamiast tego.
     * Metoda zachowana dla kompatybilności wstecznej.
     */
    static async addNewEntity(entityData: {
        name: string;
        address?: string;
        taxNumber?: string;
        www?: string;
        email?: string;
        phone?: string;
    }): Promise<Entity> {
        return await this.add(entityData);
    }

    /**
     * @deprecated Użyj EntitiesController.edit(entityData) zamiast tego.
     * Metoda zachowana dla kompatybilności wstecznej.
     */
    static async updateEntity(entityData: {
        id: number;
        name?: string;
        address?: string;
        taxNumber?: string;
        www?: string;
        email?: string;
        phone?: string;
    }): Promise<Entity> {
        return await this.edit(entityData);
    }

    /**
     * @deprecated Użyj EntitiesController.delete(entityData) zamiast tego.
     * Metoda zachowana dla kompatybilności wstecznej.
     */
    static async deleteEntity(entityData: Entity): Promise<void> {
        return await this.delete(entityData);
    }
}
