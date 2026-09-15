import BusinessObject from '../../BussinesObject';
import {
    PersonAccountEventData,
    PersonAccountEventType,
} from '../../types/types';

/**
 * ROD-3 (pack ROD, D-ROD-5 wariant (a)): jedno zdarzenie = jedna zmieniona wartość konta osoby.
 *
 * Model bez I/O (Clean Architecture). Kolumny tabeli PersonAccountEvents mapują się z pól
 * bez `_` (konwencja ToolsDb: pierwsza litera wielka). Pola z `_` (data z bazy, imię i nazwisko
 * autora z JOIN) nie jadą w INSERT.
 *
 * DLACZEGO WARTOŚCI JAKO JSON, A NIE KOLUMNY PER POLE: lista zmienianych pól konta rośnie
 * (rola, e-mail, aktywność, FIDman, zakres projektów, sześć flag panelu) i różni się typem;
 * jedna para (przed/po) jako tekst JSON trzyma to bez kolejnych migracji.
 *
 * SEKRETY NIGDY TU NIE TRAFIAJĄ: tokeny odświeżania są poza zamkniętą listą pól, które
 * kontroler ma prawo zapisać do zdarzeń (ROD-2: token nie opuszcza serwera - także do tej tabeli).
 */
export default class PersonAccountEvent
    extends BusinessObject
    implements PersonAccountEventData
{
    id?: number;
    personId: number;
    /**
     * Autor zmiany (osoba z sesji). `undefined` = brak autora -> ToolsDb pomija pole, kolumna
     * zostaje NULL. Typ bez `null`, bo klasa bazowa BusinessObject deklaruje `editorId?: number`.
     */
    editorId?: number;
    eventType: PersonAccountEventType;
    field: string;
    valueBefore: string | null;
    valueAfter: string | null;
    _createdAt?: string;
    _editorName?: string | null;
    _editorSurname?: string | null;

    constructor(init: PersonAccountEventData) {
        super({ ...init, _dbTableName: 'PersonAccountEvents' });
        if (!init.personId)
            throw new Error('PersonAccountEvent: personId is required');
        if (!init.eventType)
            throw new Error('PersonAccountEvent: eventType is required');
        if (!init.field) throw new Error('PersonAccountEvent: field is required');

        this.id = init.id;
        this.personId = init.personId;
        this.editorId = init.editorId ?? undefined;
        this.eventType = init.eventType;
        this.field = init.field;
        this.valueBefore = init.valueBefore ?? null;
        this.valueAfter = init.valueAfter ?? null;
        this._createdAt = init._createdAt;
        this._editorName = init._editorName;
        this._editorSurname = init._editorSurname;
    }
}
