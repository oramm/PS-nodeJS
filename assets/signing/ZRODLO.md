# Skad sa te pliki

Zasoby widocznego podpisu w PDF (modul `src/signing`, pack SIG).

- `envi_podpis_symbol_96x96_transparent.png` - symbol ENVI, kopia bajt w bajt z
  `.claude/skills/drive-szafir-sign/assets/` (Second Brain). Ta sama grafika, co w lokalnym skillu.
- `OpenSans-Regular.ttf`, `OpenSans-Bold.ttf` - Open Sans 3.003, licencja SIL Open Font License 1.1
  (`LICENSE-OpenSans-OFL.txt`; ta sama informacja siedzi w tabeli `name` samych plikow, bez
  "Reserved Font Name"). OFL pozwala osadzac czcionke w dokumentach. TTF jest potrzebny, bo
  standardowe czcionki PDF nie maja polskich znakow diakrytycznych. Zrodlo plikow: pakiet npm
  `@expo-google-fonts/open-sans` 0.4.2 (statyczne TTF z Google Fonts), odczytane 2026-10-09.
- Odrzucone (2026-10-09): Liberation Sans 1.07.4 z `pdfjs-dist` - tabela `name` pliku mowi "Liberation
  Fonts license", nie OFL, wiec licencja niejednoznaczna. Noto Sans, PT Sans i Source Sans 3 -
  licencja OFL, ale po podzbiorze (subset) w `@pdf-lib/fontkit` renderuja sie z brakujacymi znakami.
  Roboto, Lato i Open Sans podzbior znosza. Nowa czcionke trzeba sprawdzic RENDEREM, nie tylko
  ekstrakcja tekstu: ekstrakcja potrafi byc poprawna przy zepsutych glifach.
