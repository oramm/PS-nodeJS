---
applyTo: '**/*.ts'
---

# Instructions for Architektura

Oczywiście. Oto propozycja dokumentu z wytycznymi architektonicznymi, który podsumowuje naszą dyskusję. Można go przekazać bezpośrednio architektowi lub zespołowi programistów jako fundament do pracy.

---

### **Wytyczne Architektoniczne Systemu**

#### **1. Wprowadzenie i Filozofia**

Niniejszy dokument określa architekturę oraz kluczowe wzorce projektowe stosowane w naszym systemie. Celem jest zapewnienie wysokiej jakości kodu, jego spójności, testowalności i łatwości w utrzymaniu.

Podstawą naszej architektury jest zasada **Separacji Odpowiedzialności (Separation of Concerns)**, realizowana poprzez ścisły podział na warstwy. Każda warstwa ma jedno, dobrze zdefiniowane zadanie.

#### **2. Podstawowe Wzorce i Dobre Praktyki**

-   **Architektura Warstwowa:** System jest oparty na wielowarstwowym modelu, inspirowanym wzorcami takimi jak MVC (Model-View-Controller) i Clean Architecture. Zapewnia to jednokierunkowy przepływ zależności.
-   **Zasada Jednej Odpowiedzialności (Single Responsibility Principle - SRP):** Każda klasa i każda warstwa ma tylko jeden powód do zmiany.
-   **DRY (Don't Repeat Yourself):** Unikamy powielania kodu poprzez stosowanie dziedziczenia, kompozycji i metod pomocniczych we właściwych warstwach.
-   **Wstrzykiwanie Zależności (Dependency Injection - DI):** Choć nie jest to obecnie w pełni zaimplementowane, dążymy do tego, aby zależności (jak repozytoria) były "wstrzykiwane" do klas, które ich używają, zamiast być tworzone wewnątrz nich. Ułatwia to testowanie i wymianę komponentów.
-   **Testowalność:** Warstwy izolowane, dane przekazywane przez parametry (nie pobierane wewnątrz), unikanie cykli zależności (np. model nie importuje kontrolera).

#### **3. Jednokierunkowy Przepływ Danych**

Wszystkie operacje w systemie muszą przestrzegać poniższego schematu przepływu danych. Żadna warstwa nie może komunikować się z warstwą "wyżej" (np. Repozytorium nie może wywołać Kontrolera).

`Router → Controller (Service) → Repository → Model`

1.  **Router** odbiera żądanie HTTP.
2.  **Controller** orkiestruje operację, wywołując metody na Repozytorium i Modelu.
3.  **Repository** komunikuje się z bazą danych.
4.  **Model** jest tworzony lub aktualizowany na podstawie danych.

---

### **4. Opis Warstw Architektonicznych**

#### **4.1. Router (Warstwa HTTP)**

-   **Rola:** Tłumacz protokołu HTTP na wywołania aplikacji. Jest to najcieńsza możliwa warstwa.

-   **✅ Co Powinien Robić:**

    -   Definiować endpointy (np. `app.post('/cities', ...)`).
    -   Przetwarzać surowe obiekty `request` i `response`.
    -   Wyciągać dane z `req.params`, `req.body`, `req.query`.
    -   Wywołać **jedną, odpowiednią metodę** w Kontrolerze.
    -   Obsłużyć finalny wynik z Kontrolera, wysyłając odpowiedź (np. `res.send(result)`) lub błąd (`next(error)`).

-   **❌ Czego Nie Powinien Robić:**
    -   Zawierać jakiejkolwiek logiki biznesowej lub aplikacyjnej.
    -   Bezpośrednio tworzyć instancji Modeli (`new City(...)`).
    -   Bezpośrednio wywoływać metod Repozytorium.
    -   Budować zapytań do bazy danych.

#### **4.2. Controller / Service (Warstwa Aplikacji)**

-   **Rola:** Mózg operacji. Koordynuje pracę innych warstw, aby zrealizować konkretny scenariusz użycia (use case).

-   **✅ Co Powinien Robić:**

    -   Implementować logikę aplikacyjną (workflow), np. "dodaj nowe miasto".
    -   Otrzymywać dane od Routera.
    -   Wywoływać metody na odpowiednich Repozytoriach, aby pobrać lub zapisać dane.
    -   Tworzyć instancje Modeli (`new City(data)`).
    -   Wywoływać metody na instancjach Modeli w celu wykonania logiki biznesowej (`city.generateUniqueCode()`).
    -   Koordynować operacje na wielu repozytoriach (np. w ramach transakcji).
    -   Zwracać przetworzone dane lub potwierdzenie operacji do Routera.

-   **❌ Czego Nie Powinien Robić:**
    -   Bezpośrednio komunikować się z bazą danych (pisać zapytań SQL).
    -   Bezpośrednio operować na obiektach `request` i `response`.
    -   Zawierać logiki, która jest ściśle związana z modelem biznesowym (powinna być w Modelu) lub dostępem do danych (powinna być w Repozytorium).

#### **4.3. Repository (Warstwa Dostępu do Danych)**

-   **Rola:** Abstrakcja i jedyny punkt kontaktu z konkretnym źródłem danych (np. bazą SQL).

-   **✅ Co Powinien Robić:**

    -   Implementować wszystkie operacje CRUD (Create, Read, Update, Delete).
    -   Budować i wykonywać zapytania do bazy danych (np. SQL).
    -   Korzystać z narzędzi dostępu do danych (np. `ToolsDb`).
    -   Mapować surowe wyniki z bazy danych na instancje Modeli.
    -   Implementować logikę wyszukiwania, filtrowania i sortowania na poziomie bazy danych.
    -   Obsługiwać polimorfizm zapisu/odczytu (np. inaczej zapisywać `City`, a inaczej `CapitalCity`).

-   **❌ Czego Nie Powinien Robić:**
    -   Zawierać logiki biznesowej lub aplikacyjnej.
    -   Wiedzieć o istnieniu Kontrolerów czy Routerów.
    -   Koordynować pracy innych repozytoriów – to zadanie dla Kontrolera.

#### **4.4. Model (Warstwa Biznesowa / Domenowa)**

-   **Rola:** Serce aplikacji. Definiuje obiekty biznesowe, ich właściwości, stan i zachowanie.

-   **✅ Co Powinien Robić:**

    -   Definiować właściwości obiektu (np. `name`, `code`).
    -   Zawierać logikę walidacji stanu wewnętrznego (np. `validateName()`).
    -   Implementować metody biznesowe, które operują wyłącznie na danych tego obiektu (`generateCodeFromName()`).
    -   Otrzymywać dane z zewnątrz jako parametry metod (`generateUniqueCode(existingCodes)`).

-   **❌ Czego Nie Powinien Robić:**
    -   Wiedzieć o istnieniu jakiejkolwiek innej warstwy (importować Kontrolerów, Repozytoriów).
    -   Wykonywać jakichkolwiek operacji wejścia/wyjścia (I/O) – komunikacji z bazą danych, systemem plików czy siecią.
    -   Zawierać logiki związanej z protokołem HTTP.

---

### **5. Dziedziczenie i Polimorfizm**

Wykorzystujemy dziedziczenie w celu przestrzegania zasady DRY i modelowania relacji biznesowych.

-   **W Warstwie Modeli:** Jest to naturalne. Podklasy (np. `CapitalCity`) dziedziczą po klasach bazowych (np. `City`), rozszerzając je o nowe właściwości i metody biznesowe.

-   **W Warstwie Repozytoriów:** Dziedziczenie jest również zalecane w celu unifikacji operacji CRUD.
    -   Można stworzyć generyczną klasę `BaseRepository<T>`, która implementuje standardowe metody (`findById`, `deleteById` itp.).
    -   Konkretne repozytoria (np. `CityRepository`) mogą dziedziczyć po `BaseRepository`, unikając powielania kodu.
    -   Polimorfizm jest realizowany wewnątrz metod repozytorium (np. `save(item)`), które sprawdzają typ obiektu (`item instanceof CapitalCity`) i na tej podstawie wykonują odpowiednią logikę zapisu.

### Dodatkowe Wytyczne dla Architekta i Programistów

-   Skalowalność: Warstwy są luźno sprzężone – możesz zmienić bazę (w repo) bez wpływu na model. Dla dużych systemów dodaj Service layer (między controller a repo) dla złożonych use case'ów.
-   Testy: Jednostkowe dla modelu (izolowane), integracyjne dla repo (z mock bazą), e2e dla routera.
-   Implementacja: Używaj TypeScript dla typów, wstrzykiwania (np. dependency injection w kontrolerze).
-   Monitoruj cykle zależności (np. narzędziami jak madge).
