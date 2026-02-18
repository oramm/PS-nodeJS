# Debug: import-confirm endpoints nie zapisują do bazy

## Kontekst

Trzy endpointy `import-confirm` odpowiadają 200 z `{ added: [], skipped: [] }`, ale nic nie trafia do bazy.
Analiza kodu ujawniła **konkretną przyczynę** dla skills oraz kilka miejsc do weryfikacji dla experiences i educations.

## Backend – repo: `C:\Apache24\htdocs\PS-nodeJS`

## Znaleziona przyczyna nr 1 — skills: niezgodność pola `skillName` vs `name`

W `ToolsAI.ts` backend definiuje:
```typescript
export type AiSkill = {
    skillName: string;  // ← to pole zwraca analyze-file
    levelCode?: string;
    yearsOfExperience?: number;
};
```

W `ProfileSkillController.importFromDto` (linia 71–74):
```typescript
static async importFromDto(
    personId: number,
    items: Array<{ skillName: string; levelCode?: string; yearsOfExperience?: number }>,
```

Frontend zdefiniował typ `AiProfileSkill` z polem `name` (nie `skillName`), ale przy wysyłaniu do `import-confirm` przesyła obiekty dokładnie tak, jak je dostał z `analyze-file` — czyli z `skillName`. Do tego dochodzi pole `_tempId` dodane przez frontend.

**Zadanie 1 — zweryfikować empirycznie**: Dodaj `console.log('[skills import] received items:', JSON.stringify(items))` na początku handlera `/skills/import-confirm` w `ProfileSkillRouters.ts` (przed wywołaniem `importFromDto`). Uruchom serwer, wyślij żądanie i sprawdź, czy items ma pole `skillName` czy `name` — i czy tablica nie jest pusta.

**Jeśli `name` zamiast `skillName`**: W `ProfileSkillController.importFromDto` zmień odczyt pola:
```typescript
// PRZED
const normalized = SkillsDictionaryRepository.normalizeName(item.skillName);
let skillEntry = dictionaryCache.get(normalized) ??
    (await dictRepo.findByNormalizedName(item.skillName));
if (!skillEntry) {
    skillEntry = await dictRepo.addSkillInDb({ name: item.skillName }, conn);
```
```typescript
// PO — obsługa obu nazw pól dla kompatybilności
const skillName = (item as any).skillName ?? (item as any).name;
const normalized = SkillsDictionaryRepository.normalizeName(skillName);
let skillEntry = dictionaryCache.get(normalized) ??
    (await dictRepo.findByNormalizedName(skillName));
if (!skillEntry) {
    skillEntry = await dictRepo.addSkillInDb({ name: skillName }, conn);
```

Też zaktualizuj typ parametru `items` w `importFromDto` żeby akceptował oba kształty:
```typescript
items: Array<{ skillName?: string; name?: string; levelCode?: string; yearsOfExperience?: number }>,
```

---

## Znaleziona przyczyna nr 2 — wszystkie trzy: duplikat detection przy pustej bazie

### Experiences: `findByPeriod`

```typescript
async findByPeriod(
    personId: number,
    dateFrom: string | null | undefined,
    dateTo: string | null | undefined,
    conn: mysql.PoolConnection,
)
```

Używa `ppe.DateFrom <=> ?` (NULL-safe equality). Jeśli AI zwróciło `dateFrom: undefined`, a w bazie istnieje już rekord z `DateFrom IS NULL` — dopasuje jako duplikat.

**Zadanie 2**: Dodaj `console.log('[experiences import] findByPeriod result:', duplicate, 'for:', item.dateFrom, item.dateTo)` wewnątrz pętli w `ExperienceController.importFromDto`, żeby zobaczyć które elementy trafiają do `skipped`.

### Educations: `findBySchoolAndDate`

Sprawdź sygnaturę metody `EducationRepository.findBySchoolAndDate` — jeśli `schoolName` jest pusty string zamiast undefined, może dopasowywać istniejące rekordy.

**Zadanie 3**: Tak samo — dodaj log wewnątrz pętli w `EducationController.importFromDto`.

---

## Znaleziona przyczyna nr 3 — `parsedBody` transformacja

W `index.ts` middleware:
```typescript
req.parsedBody = Tools.parseObjectsJSON(req.body);
```

Sprawdź co robi `Tools.parseObjectsJSON` z tablicą obiektów. Jeśli parsuje stringi JSON w polach, to przy tablicy prostych obiektów nie powinno być problemu — ale potwierdź loggiem.

**Zadanie 4**: Dodaj log do każdego z trzech import-confirm handlerów:
```typescript
console.log('[import-confirm] body:', JSON.stringify(req.body));
console.log('[import-confirm] parsedBody:', JSON.stringify(req.parsedBody));
console.log('[import-confirm] items count:', items.length);
```

---

## Znaleziona przyczyna nr 4 — PersonProfile nie istnieje

`addExperienceInDb` i `addEducationInDb` wywołują `ensurePersonProfileId`, który tworzy `PersonProfiles` rekord jeśli nie istnieje. Metoda `addSkillInDb` też korzysta z tego mechanizmu (przez `ProfileSkillRepository`).

**Zadanie 5**: Sprawdź czy w tabeli `PersonProfiles` istnieje rekord dla testowanej osoby (`SELECT * FROM PersonProfiles WHERE PersonId = X`). Jeśli nie, `ensurePersonProfileId` powinien go stworzyć — ale upewnij się że nie rzuca cichego błędu gdy np. `PersonId` nie ma foreign key w tabeli `Persons`.

---

## Plan działania — kolejność kroków

1. Uruchom serwer z logami (Zadanie 4) — sprawdź czy `items` dociera niepuste
2. Sprawdź logiem (Zadanie 1) czy skills mają `skillName` czy `name`
3. Sprawdź logi duplicate detection (Zadania 2 i 3) — czy wszystko idzie do skipped
4. Zapytaj bazę: `SELECT * FROM PersonProfiles WHERE PersonId = <testId>`
5. Na podstawie wyników zastosuj odpowiednią poprawkę

---

## Po naprawie: weryfikacja

```bash
# Uruchom testy units dla ProfileSkillController
npx jest profileSkill --verbose

# Uruchom testy jednostkowe EducationController
npx jest EducationController --verbose

# Ręczny test przez curl (lub Postman):
curl -X POST http://localhost:3000/v2/persons/42/profile/experiences/import-confirm \
  -H "Content-Type: application/json" \
  -d '{"items":[{"organizationName":"Test Org","positionName":"Dev","dateFrom":"2020-01-01"}]}'
# Oczekiwany response: { "added": [{ "id": ..., "organizationName": "Test Org", ... }], "skipped": [] }
```

## Pliki do edycji

| Plik | Co sprawdzić/zmienić |
|------|---------------------|
| `src/persons/profileSkills/ProfileSkillController.ts` | `importFromDto` — obsługa `skillName` / `name` |
| `src/persons/profileSkills/ProfileSkillRouters.ts` | Logi debugowe na czas diagnostyki |
| `src/persons/experiences/ExperienceController.ts` | Logi w pętli `importFromDto` |
| `src/persons/educations/EducationController.ts` | Logi w pętli `importFromDto` |
| `src/persons/educations/EducationRepository.ts` | Sygnatura `findBySchoolAndDate` |
