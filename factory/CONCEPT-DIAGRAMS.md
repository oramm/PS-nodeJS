# Dark Factory Diagrams (Human-Friendly)

> Diagramy uzupelniajace `factory/CONCEPT.md`.
> Data aktualizacji: 2026-02-20

## 1. High-level architektura fabryki

Jak czytac:
- Czlowiek zatwierdza checkpointy.
- Orchestrator zarzadza przebiegiem.
- Subagenty realizuja wyspecjalizowane etapy.

```mermaid
flowchart LR
    H[Czlowiek] -->|Cel + constraints| O[Orchestrator]
    O --> P[Planner]
    O --> C[Coder]
    O --> R[Reviewer]
    O --> F[Fixer]
    O --> T[Tester]
    O --> D[Docs]
    O --> M[Committer]

    P --> O
    C --> T
    T -->|PASS| R
    T -->|FAIL| F
    R -->|APPROVE| D
    R -->|REQUEST_CHANGES| F
    F --> T
    D --> M
    M --> H

    O -. checkpoint .-> H
```

## 2. Petla Coder/Reviewer/Fixer

Jak czytac:
- Loop ma limit 3 iteracji.
- Po limicie jest eskalacja do czlowieka.

```mermaid
flowchart TD
    A[Coder: kod v1] --> B[Tester]
    B -->|PASS| C[Reviewer]
    B -->|FAIL| D[Fixer]
    C -->|APPROVE| G[Przekaz do Docs]
    C -->|REQUEST_CHANGES| D
    D --> E{Iteracje < 3?}
    E -->|Tak| B
    E -->|Nie| F[Eskalacja do czlowieka]
```

## 3. Pelny proces z checkpointami czlowieka

Jak czytac:
- Checkpointy sa "hard gates".
- Produkcja taskow dzieje sie w petli.

```mermaid
flowchart TD
    H0[Czlowiek: cel] --> P[Planner]
    P --> CP1{Checkpoint planu}
    CP1 -->|Approve| A[Architektura]
    CP1 -->|Zmiany| P

    A --> CP2{Checkpoint architektury}
    CP2 -->|Approve| L[Petla taskow]
    CP2 -->|Zmiany| A

    L --> C[Coder]
    C --> T[Tester]
    T --> R[Reviewer]
    R --> F[Fixer]
    F --> T
    R --> D[Docs]
    D --> G[Commit/PR]
    G --> N{Kolejny task?}
    N -->|Tak| L
    N -->|Nie| CP3{Final checkpoint}
    CP3 -->|Approve| END[Merge/Release]
    CP3 -->|Zmiany| L
```

## 4. Warstwy wdrozenia: wplyw vs latwosc

Jak czytac:
- Kolejnosc budowy preferuje szybki zwrot jakosci.
- Warstwa 1 jest juz zakonczona.

```mermaid
quadrantChart
    title Priorytety wdrozenia Dark Factory
    x-axis Trudnosc wdrozenia --> Latwosc wdrozenia
    y-axis Niski wplyw --> Wysoki wplyw
    quadrant-1 Trudne / wysoki wplyw
    quadrant-2 Latwe / wysoki wplyw
    quadrant-3 Trudne / niski wplyw
    quadrant-4 Latwe / niski wplyw
    "Warstwa 1: Reviewer (DONE)": [0.80, 0.90]
    "Warstwa 2: Test Pipeline": [0.65, 0.80]
    "Warstwa 3: Planner": [0.55, 0.75]
    "Warstwa 4: Auto-docs": [0.70, 0.60]
    "Pelna orkiestracja agent teams": [0.35, 0.95]
```
