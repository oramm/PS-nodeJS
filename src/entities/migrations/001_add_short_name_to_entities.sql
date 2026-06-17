-- Migration: Add ShortName column to Entities table
-- Table: Entities
-- Purpose: Optional unique short name (alias) for entity, max 15 characters
--          NULL values are allowed (existing records unaffected) and do not conflict with UNIQUE constraint

ALTER TABLE Entities
    ADD COLUMN ShortName VARCHAR(15) NULL DEFAULT NULL AFTER Name,
    ADD UNIQUE KEY uq_entities_short_name (ShortName);


START TRANSACTION;

UPDATE `Entities` SET `ShortName` = 'ENVI' WHERE `Id` = 1; -- ENVI
UPDATE `Entities` SET `ShortName` = 'Wlasna Dzial.' WHERE `Id` = 2; -- Własna działalność
UPDATE `Entities` SET `ShortName` = 'Aqua-Sprint' WHERE `Id` = 3; -- Aqua - Sprint
UPDATE `Entities` SET `ShortName` = 'ARGO Archeo' WHERE `Id` = 4; -- ARGO Pracownia Archeologiczno-Konserwatorska 
UPDATE `Entities` SET `ShortName` = 'ATA-TECHNIK' WHERE `Id` = 5; -- ATA - TECHNIK
UPDATE `Entities` SET `ShortName` = 'ATREE' WHERE `Id` = 6; -- ATREE Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'Serwis Mitsubi' WHERE `Id` = 7; -- Autoryzowany Serwis Mitsubishi
UPDATE `Entities` SET `ShortName` = 'AVK Armadan' WHERE `Id` = 8; -- AVK Armadan LTD.
UPDATE `Entities` SET `ShortName` = 'BIKON' WHERE `Id` = 9; -- BIKON
UPDATE `Entities` SET `ShortName` = 'BIN Obsluga' WHERE `Id` = 10; -- Biuri Obsługi Inwestycji Budowlanych BIN
UPDATE `Entities` SET `ShortName` = 'Doradztwo Pod.' WHERE `Id` = 11; -- Biuro doradztwa podatkowego
UPDATE `Entities` SET `ShortName` = 'BI Janusz Rybk' WHERE `Id` = 12; -- Biuro Inwestorskie Janusz Rybka
UPDATE `Entities` SET `ShortName` = 'Proj. Drogowe' WHERE `Id` = 13; -- Biuro studiów i projektów drogownictwa
UPDATE `Entities` SET `ShortName` = 'Collect Cons.' WHERE `Id` = 14; -- Collect Consulting
UPDATE `Entities` SET `ShortName` = 'Control Prog.' WHERE `Id` = 15; -- Control Progress S.A.
UPDATE `Entities` SET `ShortName` = 'Dom Veolii' WHERE `Id` = 16; -- Dom Veolii
UPDATE `Entities` SET `ShortName` = 'DSDiK Wroclaw' WHERE `Id` = 17; -- DSDiK Wrocław
UPDATE `Entities` SET `ShortName` = 'E&A Muraszczek' WHERE `Id` = 18; -- E&A Dariusz Muraszczek
UPDATE `Entities` SET `ShortName` = 'EKO-SKARBIMIER' WHERE `Id` = 19; -- EKO-SKARBIMIERZ Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'Ekowodrol' WHERE `Id` = 20; -- Ekowodrol Koszalin
UPDATE `Entities` SET `ShortName` = 'Elektrus' WHERE `Id` = 21; -- Elektrus
UPDATE `Entities` SET `ShortName` = 'Eltf T.Furtak' WHERE `Id` = 22; -- Eltf Tadeusz Furtak
UPDATE `Entities` SET `ShortName` = 'EnviRail' WHERE `Id` = 23; -- EnviRail
UPDATE `Entities` SET `ShortName` = 'EUROTECH' WHERE `Id` = 24; -- EUROTECH
UPDATE `Entities` SET `ShortName` = 'FDI INZ Marcin' WHERE `Id` = 25; -- FDI INŻ Marcin Ciećwierz, DSiK Wrocław
UPDATE `Entities` SET `ShortName` = 'Witold Matus' WHERE `Id` = 26; -- PROJEKTOWANIE NADZÓR WYKONAWSTWO INSTALACJI I SIECI ELEKTRYCZNYCH INŻ WITOLD MATUS
UPDATE `Entities` SET `ShortName` = 'Fortum' WHERE `Id` = 27; -- Fortum
UPDATE `Entities` SET `ShortName` = 'FRAM CONSULT.' WHERE `Id` = 28; -- FRAM CONSULTING
UPDATE `Entities` SET `ShortName` = 'Future Proc.' WHERE `Id` = 29; -- Future Processing
UPDATE `Entities` SET `ShortName` = 'Gelsenwasser' WHERE `Id` = 30; -- Gelsenwasser Polska
UPDATE `Entities` SET `ShortName` = 'GDDKiA Opole' WHERE `Id` = 31; -- Generalna Dyrekcja Dróg Krajowych i Autostrad Oddział w Opolu
UPDATE `Entities` SET `ShortName` = 'Gm. Jastkow' WHERE `Id` = 32; -- Gmina Jastków
UPDATE `Entities` SET `ShortName` = 'Gm. Scinawa' WHERE `Id` = 33; -- Gmina Ścinawa
UPDATE `Entities` SET `ShortName` = 'Gm. Wielka Wies' WHERE `Id` = 34; -- Gmina Wielka Wieś
UPDATE `Entities` SET `ShortName` = 'GSG Industria' WHERE `Id` = 35; -- GSG Industria Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'INBUD' WHERE `Id` = 36; -- INBUD
UPDATE `Entities` SET `ShortName` = 'Ind. Services' WHERE `Id` = 37; -- Industrial Services
UPDATE `Entities` SET `ShortName` = 'INIKO MGGP' WHERE `Id` = 38; -- INIKO Grupa MGGP
UPDATE `Entities` SET `ShortName` = 'IZiS Sp. z o.o' WHERE `Id` = 39; -- Instytut Zarządzania i Samorządność Sp. z o. o.
UPDATE `Entities` SET `ShortName` = 'Inwest-Tor' WHERE `Id` = 40; -- Inwest-Tor Remigiusz Kowalski
UPDATE `Entities` SET `ShortName` = 'JS Architekci' WHERE `Id` = 41; -- JS Architekci
UPDATE `Entities` SET `ShortName` = 'KRP M.Wrobel' WHERE `Id` = 42; -- Kancelaria Radcy Prawnego Marek Wróbel
UPDATE `Entities` SET `ShortName` = 'Kolektor Serw.' WHERE `Id` = 43; -- Kolektor Serwis sp.j. K. Janiak, M. Janiak, Ł. Janiak
UPDATE `Entities` SET `ShortName` = 'Konstr. Jastrz' WHERE `Id` = 44; -- Konstrukcje Jastrzębie sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'KPPM Doradztwo' WHERE `Id` = 45; -- KPPM Doradztwo
UPDATE `Entities` SET `ShortName` = 'LSI Lodz' WHERE `Id` = 46; -- Łódzka Spółka Infrastrukturalna sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'Mar-Tel' WHERE `Id` = 47; -- Mar-Tel
UPDATE `Entities` SET `ShortName` = 'Megabit' WHERE `Id` = 48; -- Megabit Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'MZGK Chelmek' WHERE `Id` = 49; -- Miejski Zakład Gospodarki Komunalnej Sp. z o.o. w Chełmku
UPDATE `Entities` SET `ShortName` = 'MPWiK Ogolny' WHERE `Id` = 50; -- Miejskie Przedsiębiorstwo Wodociagów i Kanalizacji Spółka z o.o.
UPDATE `Entities` SET `ShortName` = 'Mosin' WHERE `Id` = 51; -- Mosin
UPDATE `Entities` SET `ShortName` = 'Wodoc. Jaworzn' WHERE `Id` = 52; -- Wodociągi Jaworzno sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'MPWiK Zywiec' WHERE `Id` = 53; -- MPWiK Żywiec
UPDATE `Entities` SET `ShortName` = 'BRAK' WHERE `Id` = 54; -- brak
UPDATE `Entities` SET `ShortName` = 'OTS-IP' WHERE `Id` = 55; -- OTS-IP
UPDATE `Entities` SET `ShortName` = 'PIU CONSULTING' WHERE `Id` = 56; -- P I U CONSULTING
UPDATE `Entities` SET `ShortName` = 'Eko-Karat' WHERE `Id` = 57; -- P.P.H.U. Eko-Karat
UPDATE `Entities` SET `ShortName` = 'KALMET' WHERE `Id` = 58; -- P.U.H.T.I. KALMET K.W.
UPDATE `Entities` SET `ShortName` = 'PASANIT Pawnuk' WHERE `Id` = 59; -- PASANIT Projektowanie i nadzory inwestorskie Józef Pawnuk
UPDATE `Entities` SET `ShortName` = 'PGK Zyrardow' WHERE `Id` = 60; -- PGK Żyrardów Sp. z o. o.
UPDATE `Entities` SET `ShortName` = 'PGKiM' WHERE `Id` = 61; -- Przedsiębiorstwo Gospodarki Komunalnej i Mieszkaniowej Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'PZD' WHERE `Id` = 62; -- Powiatowy Zarząd Dróg
UPDATE `Entities` SET `ShortName` = 'PGKiM Leczna' WHERE `Id` = 63; -- Przedsiębiorstwo Gospodarki Komunalnej i Mieszkaniowej Łęczna Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'PWK Wolow' WHERE `Id` = 64; -- Przedsiębiorstwo Wodno-kanalizacyjne Wołów Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'PWiK Gniezno' WHERE `Id` = 65; -- Przedsiębiorstwo Wodociągów i Kanalizacji w Gnieźnie Spółka z o.o.
UPDATE `Entities` SET `ShortName` = 'IBTech' WHERE `Id` = 66; -- PTIiB IBTech
UPDATE `Entities` SET `ShortName` = 'PWiK Chorzow' WHERE `Id` = 67; -- PWiK Chorzów
UPDATE `Entities` SET `ShortName` = 'Quantum-Bio' WHERE `Id` = 68; -- Quantum -Bio
UPDATE `Entities` SET `ShortName` = 'Semako' WHERE `Id` = 69; -- Semako Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'SKARS' WHERE `Id` = 70; -- SKARS Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'SUEZ SAFAGE' WHERE `Id` = 71; -- SUEZ SAFAGE
UPDATE `Entities` SET `ShortName` = 'Sweco Cons.' WHERE `Id` = 72; -- Sweco Consulting Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'SYNERGY POLAND' WHERE `Id` = 73; -- SYNERGY POLAND Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'SGPK Swidnica' WHERE `Id` = 74; -- Świdnickie Gminne Przedsiębiorstwo Komunalne Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'Tomasz Kulasa' WHERE `Id` = 75; -- Tomasz Kulasa
UPDATE `Entities` SET `ShortName` = 'TSJ-BUD' WHERE `Id` = 76; -- TSJ-BUD
UPDATE `Entities` SET `ShortName` = 'UM Ruda Slaska' WHERE `Id` = 77; -- UM Ruda Śląska
UPDATE `Entities` SET `ShortName` = 'Uniqa' WHERE `Id` = 78; -- Uniqa 
UPDATE `Entities` SET `ShortName` = 'Gm. Radkow' WHERE `Id` = 79; -- Gmina Radków
UPDATE `Entities` SET `ShortName` = 'Wagrowiec Insp' WHERE `Id` = 80; -- Wągrowiec inspektor
UPDATE `Entities` SET `ShortName` = 'WiK Turawa' WHERE `Id` = 81; -- Wodociągi i Kanalizacja Turawa Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'AQUA-SPRINT Si' WHERE `Id` = 82; -- Wodociągi Siemianowickie AQUA-SPRINT Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'Wod. Srebrna G' WHERE `Id` = 83; -- Wodociągi srebrnogórskie Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'UM Nysa IRiD' WHERE `Id` = 84; -- Wydział Rozwoju Infrastruktury i Drogownictwa Urząd Miejski w Nysie 
UPDATE `Entities` SET `ShortName` = 'WINSAN' WHERE `Id` = 85; -- Zakład Inżynierii Sanitarnej „WINSAN”  L. Walkiewicz Z. Warwarko Spółka Jawna
UPDATE `Entities` SET `ShortName` = 'ZBO' WHERE `Id` = 86; -- Zakład Budownictwa Ogólnego
UPDATE `Entities` SET `ShortName` = 'ZGK Twardogora' WHERE `Id` = 87; -- Zakład Gospodarki Komunalnej sp. z o.o. Twardogóra
UPDATE `Entities` SET `ShortName` = 'ZT Kruszwica' WHERE `Id` = 88; -- Zakłady Tłuszczowe Kruszwica
UPDATE `Entities` SET `ShortName` = 'ZWIK Nowa Ruda' WHERE `Id` = 89; -- ZWIK Nowa Ruda
UPDATE `Entities` SET `ShortName` = 'Gm. Kobierzyce' WHERE `Id` = 90; -- Gmina Kobierzyce
UPDATE `Entities` SET `ShortName` = 'Gm. Grodkow' WHERE `Id` = 185; -- Gmina Grodków
UPDATE `Entities` SET `ShortName` = 'Esko Inz Srod.' WHERE `Id` = 187; -- Esko Przedsiębiorstwo Inżynierii Środowiska s.c.
UPDATE `Entities` SET `ShortName` = 'BROKERRES' WHERE `Id` = 188; -- BROKERRES Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'POLINVEST' WHERE `Id` = 189; -- POLINVEST Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'AKWA Nysa' WHERE `Id` = 190; -- Wodociągi i Kanalizacja AKWA Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'ZWiK Strzelin' WHERE `Id` = 191; -- ZWiK Strzelin Sp. z o.o. 
UPDATE `Entities` SET `ShortName` = 'Mentor S.A.' WHERE `Id` = 192; -- Mentor S.A.
UPDATE `Entities` SET `ShortName` = 'Instal Projekt' WHERE `Id` = 195; -- Instal Projekt Kwaśnicki Tomasz
UPDATE `Entities` SET `ShortName` = 'BOI Andrzejcza' WHERE `Id` = 196; -- Biuro obsługi inwestycji Rafał Andrzejczak 
UPDATE `Entities` SET `ShortName` = 'Infracomplex' WHERE `Id` = 197; -- Infracomplex
UPDATE `Entities` SET `ShortName` = 'MPWiK Wagrow.' WHERE `Id` = 198; -- Miejskie Przedsiębiorstwo Wodociągów i Kanalizacji Sp. z o.o. w Wągrowcu
UPDATE `Entities` SET `ShortName` = 'ADESI' WHERE `Id` = 199; -- ADESI Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'KPWIK Kobierz.' WHERE `Id` = 200; -- Kobierzyckie Przedsiębiorstwo Wodociągów i Kanalizacji Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'NFOSiGW' WHERE `Id` = 201; -- Narodowy Fundusz Ochrony Środowiska i Gospodarki Wodnej
UPDATE `Entities` SET `ShortName` = 'WOD-KAN Nowob.' WHERE `Id` = 203; -- Projektowanie i nadzór WOD-KAN Bronisław Nowobilski
UPDATE `Entities` SET `ShortName` = 'PRO-ZAT' WHERE `Id` = 204; -- PRO-ZAT
UPDATE `Entities` SET `ShortName` = 'Hortico' WHERE `Id` = 205; -- Hortico S.A.
UPDATE `Entities` SET `ShortName` = 'MPWiK Lubin' WHERE `Id` = 209; -- Miejskie Przedsiębiorstwo Wodociągów i Kanalizacji Sp. z o.o. w Lubinie
UPDATE `Entities` SET `ShortName` = 'OPWiK Olesno' WHERE `Id` = 210; -- Oleskie Przedsiębiorstwo Wodociągów i Kanalizacji Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'Gm. Olesno' WHERE `Id` = 211; -- Gmina Olesno
UPDATE `Entities` SET `ShortName` = 'UM Wagrowiec' WHERE `Id` = 212; -- Urząd Miejski w Wągrowcu
UPDATE `Entities` SET `ShortName` = 'MPWiK Myslow.' WHERE `Id` = 213; -- Miejskie Przedsiębiorstwo Wodociągów i Kanalizacji Sp. z o.o. w Mysłowicach
UPDATE `Entities` SET `ShortName` = 'KD S.A.' WHERE `Id` = 215; -- Koleje Dolnośląskie S.A.
UPDATE `Entities` SET `ShortName` = 'UI A.Rojewski' WHERE `Id` = 216; -- Usługi Inżynierskie Arkadiusz Rojewski
UPDATE `Entities` SET `ShortName` = 'Eleko Proj' WHERE `Id` = 218; -- Eleko Projektowanie i Nadzory Robót Elektrycznych
UPDATE `Entities` SET `ShortName` = 'Proinstel' WHERE `Id` = 219; -- Zakład Projektowo - Usługowy Proinstel
UPDATE `Entities` SET `ShortName` = 'Zwes' WHERE `Id` = 220; -- Zwes
UPDATE `Entities` SET `ShortName` = 'BUT-H Scigala' WHERE `Id` = 221; -- Zenon Ścigała Biuro Usług Techniczno Handlowych
UPDATE `Entities` SET `ShortName` = 'UG Strzalkow' WHERE `Id` = 223; -- Urząd Gminy w Strzałkowie
UPDATE `Entities` SET `ShortName` = 'ZWiK Skawina' WHERE `Id` = 224; -- Zakład Wodociągów i Kanalizacji Sp. z o.o. w Skawinie
UPDATE `Entities` SET `ShortName` = 'MACHNIK' WHERE `Id` = 225; -- MACHNIK Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'UNIMARK' WHERE `Id` = 227; -- UNIMARK Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'Elars' WHERE `Id` = 228; -- Firma Projektowo - Usługowa Elars s.c.
UPDATE `Entities` SET `ShortName` = 'NBM Technolog.' WHERE `Id` = 229; -- NBM Technologie Mroczka i Wspólnicy S.J.
UPDATE `Entities` SET `ShortName` = 'Hydro-Tech' WHERE `Id` = 231; -- Hydro-Tech Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'Gm. Mogilno' WHERE `Id` = 232; -- Gmina Mogilno
UPDATE `Entities` SET `ShortName` = 'MPGK Mogilno' WHERE `Id` = 233; -- Mogileńskie Przedsiębiorstwo Gospodarki Komunalnej Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'GW Uslugi Inz' WHERE `Id` = 234; -- GW Usługi Inżynierskie
UPDATE `Entities` SET `ShortName` = 'MELIOBUD' WHERE `Id` = 235; -- PKUWiM MELIOBUD Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'ZAPSOFT' WHERE `Id` = 236; -- ZAPSOFT Sp. z o. o.
UPDATE `Entities` SET `ShortName` = 'Instal Warsz.' WHERE `Id` = 237; -- Instal Warszawa S.A.
UPDATE `Entities` SET `ShortName` = 'ELCON' WHERE `Id` = 238; -- ELCON Grzegorz i Anna Konieczni Tomasz Konieczny Spółka Jawna
UPDATE `Entities` SET `ShortName` = 'Wod. Kepinskie' WHERE `Id` = 239; -- Wodociągi Kępińskie Sp z o.o.
UPDATE `Entities` SET `ShortName` = 'INSTBUD Boguta' WHERE `Id` = 240; -- Firma Handlowo-Usługowa INSTBUD Stanisław Boguta sp.j.
UPDATE `Entities` SET `ShortName` = 'EKO-WOD' WHERE `Id` = 241; -- Przedsiębiorstwo Robót Wodnych i Ekologicznych \"EKO-WOD\" Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'Gm. Dobromierz' WHERE `Id` = 242; -- Gmina Dobromierz
UPDATE `Entities` SET `ShortName` = 'Goal Polska' WHERE `Id` = 243; -- Goal Polska
UPDATE `Entities` SET `ShortName` = 'SID Szkolenia' WHERE `Id` = 244; -- SID Szkolenia i Doradztwo Sp.z o.o.
UPDATE `Entities` SET `ShortName` = 'EKO-BABICE' WHERE `Id` = 245; -- Gminne Przedsiębiorstwo Komunalne EKO-BABICE sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'Instal Krakow' WHERE `Id` = 246; -- Instal Kraków S.A.
UPDATE `Entities` SET `ShortName` = 'RS-Projekt' WHERE `Id` = 247; -- RS-Projket Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'INKADRO' WHERE `Id` = 249; -- INKADRO Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'Zamaw. Test' WHERE `Id` = 251; -- Zamawiający test
UPDATE `Entities` SET `ShortName` = 'Inzynier Test' WHERE `Id` = 252; -- Inżynier test
UPDATE `Entities` SET `ShortName` = 'Wykonawca Test' WHERE `Id` = 253; -- Wykonawca testowy
UPDATE `Entities` SET `ShortName` = 'KSSE' WHERE `Id` = 254; -- Katowicka Specjalna Strefa Ekonomiczna
UPDATE `Entities` SET `ShortName` = 'Gm. Ujazd' WHERE `Id` = 255; -- Gmina Ujazd
UPDATE `Entities` SET `ShortName` = 'Gm. Chocianow' WHERE `Id` = 256; -- Gmina Chocianów
UPDATE `Entities` SET `ShortName` = 'Hydro-Marko' WHERE `Id` = 257; -- Hydro-Marko Sp. z o.o. Sp. k.
UPDATE `Entities` SET `ShortName` = 'TECH-KAN' WHERE `Id` = 260; -- TECH-KAN Bezwykopowe Renowacje Kanalizacji Adam Wojciechowski
UPDATE `Entities` SET `ShortName` = 'Siemianowice S' WHERE `Id` = 261; -- Gmina Siemianowice Śląskie
UPDATE `Entities` SET `ShortName` = 'Bytomskie Wod' WHERE `Id` = 264; -- Bytomskie Wodociągi Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'WUPRINZ' WHERE `Id` = 265; -- WUPRINŻ S.A.
UPDATE `Entities` SET `ShortName` = 'BPBK Wroclaw' WHERE `Id` = 266; -- Biuro Projektów Budownictwa Komunalnego we Wrocławiu Sp z o.o.
UPDATE `Entities` SET `ShortName` = 'Wykonawca 1' WHERE `Id` = 267; -- Wykonawca 1
UPDATE `Entities` SET `ShortName` = 'Zamawiajacy 1' WHERE `Id` = 268; -- Zamawiający 1
UPDATE `Entities` SET `ShortName` = 'FABUD S.A.' WHERE `Id` = 271; -- FABUD Wytwórnia Konstrukcji Betonowych S.A.
UPDATE `Entities` SET `ShortName` = 'MZGK Karpacz' WHERE `Id` = 278; -- Miejski Zakład Gospodarki Komunalnej Sp. z o.o w Karpaczu
UPDATE `Entities` SET `ShortName` = 'AQUA S.A.' WHERE `Id` = 280; -- AQUA S.A.
UPDATE `Entities` SET `ShortName` = 'WASBUD R. Was' WHERE `Id` = 281; -- WASBUD Robert Wąs
UPDATE `Entities` SET `ShortName` = 'Elektromex' WHERE `Id` = 282; -- Elektromex Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'UG Czernichow' WHERE `Id` = 283; -- Urząd Gminy Czernichów
UPDATE `Entities` SET `ShortName` = 'EMSICON' WHERE `Id` = 286; -- EMSICON
UPDATE `Entities` SET `ShortName` = 'HYDROMEL' WHERE `Id` = 287; -- Zakład Usług Projektowo-Wykonawczych „HYDROMEL” Tadeusz Kowalewski
UPDATE `Entities` SET `ShortName` = 'UM Raciborz' WHERE `Id` = 288; -- URZĄD MIASTA RACIBÓRZ
UPDATE `Entities` SET `ShortName` = 'ZWIK Ziel. Gor' WHERE `Id` = 289; -- \"Zielonogórskie Wodociągi i Kanalizacja\" Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'BWiO Bogatynia' WHERE `Id` = 290; -- Bogatyńskie Wodociągi i Oczyszczalnia S.A.
UPDATE `Entities` SET `ShortName` = 'Gm. Bulkowo' WHERE `Id` = 291; -- Gmina Bulkowo
UPDATE `Entities` SET `ShortName` = 'ZGK Debnica' WHERE `Id` = 292; -- Zakład Gospodarki Komunalnej w Dębnicy Kaszubskiej Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'CONTROL PROC.' WHERE `Id` = 293; -- CONTROL PROCESS S.A.
UPDATE `Entities` SET `ShortName` = 'Visian Fryzjer' WHERE `Id` = 294; -- Salon Fryzjerski Visian Iwona Klimek
UPDATE `Entities` SET `ShortName` = 'SMCE EUROPE' WHERE `Id` = 296; -- SMCE EUROPE Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'GWIK Grodkow' WHERE `Id` = 297; -- Grodkowskie Wodociągi i Kanalizacja Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'Gm. Klecko' WHERE `Id` = 298; -- Gmina Kłecko
UPDATE `Entities` SET `ShortName` = 'MPWiK Krakow' WHERE `Id` = 299; -- Miejskie Przedsiębiorstwo Wodociągów i Kanalizacji Spółka Akcyjna w Krakowie
UPDATE `Entities` SET `ShortName` = 'WiK Krzeszow.' WHERE `Id` = 300; -- Wodociągi i Kanalizacja Krzeszowice Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'Gm. Lochow' WHERE `Id` = 301; -- Gmina Łochów
UPDATE `Entities` SET `ShortName` = 'Likom' WHERE `Id` = 302; -- Likom Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'Gm. Marki' WHERE `Id` = 303; -- Gmina Miasta Marki
UPDATE `Entities` SET `ShortName` = 'ZIM Sp. z o.o.' WHERE `Id` = 304; -- Zakład Inżynierii Miejskiej Spółka z o.o.
UPDATE `Entities` SET `ShortName` = 'Gm. Morawica' WHERE `Id` = 305; -- Miasto i Gmina Morawica
UPDATE `Entities` SET `ShortName` = 'ZUWIK' WHERE `Id` = 306; -- Zakład Usług Wodnych i Komunalnych Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'Gm. Myszyniec' WHERE `Id` = 307; -- Gmina Myszyniec
UPDATE `Entities` SET `ShortName` = 'Gm. Nowa Ruda' WHERE `Id` = 308; -- Gmina Miejska Nowa Ruda
UPDATE `Entities` SET `ShortName` = 'Gm. Wiejska NR' WHERE `Id` = 309; -- Gmina Nowa Ruda
UPDATE `Entities` SET `ShortName` = 'Gm. Nysa' WHERE `Id` = 310; -- Gmina Nysa
UPDATE `Entities` SET `ShortName` = 'PWiK Oswiecim' WHERE `Id` = 311; -- Przedsiębiorstwo Wodociągów i Kanalizacji Sp. z o. o. Oświęcim
UPDATE `Entities` SET `ShortName` = 'Gm. Otmuchow' WHERE `Id` = 312; -- Gmina Otmuchów
UPDATE `Entities` SET `ShortName` = 'Gm. Padew Nar.' WHERE `Id` = 313; -- Gmina Padew Narodowa
UPDATE `Entities` SET `ShortName` = 'ZM Panki' WHERE `Id` = 314; -- Związek Międzygminny Panki-Przystajń ds. Ochrony Wód
UPDATE `Entities` SET `ShortName` = 'ZWiK Prudnik' WHERE `Id` = 315; -- Zakład Wodociągów i Kanalizacji w Prudniku
UPDATE `Entities` SET `ShortName` = 'PWM Zabkowice' WHERE `Id` = 316; -- Przedsiębiorstwo Wodno Melioracyjne w Ząbkowicach Śl. Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'PWiK Ogolny 2' WHERE `Id` = 317; -- Przedsiębiorstwo Wodociągów i Kanalizacji Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'EKOTOM' WHERE `Id` = 318; -- EKOTOM Tomasz Nawieśniak
UPDATE `Entities` SET `ShortName` = 'GWiK Sp. z o.o' WHERE `Id` = 319; -- Gminne Wodociągi i Kanalizacja Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'WiK Ogolny' WHERE `Id` = 320; -- Wodociągi i Kanalizacja Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'Gm. Strzelin' WHERE `Id` = 321; -- Gmina Strzelin
UPDATE `Entities` SET `ShortName` = 'Gm. Swieradow' WHERE `Id` = 322; -- Gmina Miejska Świeradów-Zdrój
UPDATE `Entities` SET `ShortName` = 'ZWiK Tczew' WHERE `Id` = 323; -- Zakład Wodociągów i Kanalizacji Sp. z o. o. w Tczewie
UPDATE `Entities` SET `ShortName` = 'PWiK Wodzislaw' WHERE `Id` = 324; -- Przedsiębiorstwo Wodociągów i Kanalizacji  Sp. z o.o. z siedzibą w Wodzisławiu Śląskim
UPDATE `Entities` SET `ShortName` = 'PGK Wisznia M.' WHERE `Id` = 325; -- Przedsiębiorstwo Gospodarki Komunalnej sp. z o.o w Wiszni Małej
UPDATE `Entities` SET `ShortName` = 'Gm. Wadroze W.' WHERE `Id` = 326; -- Gmina Wądroże Wielkie
UPDATE `Entities` SET `ShortName` = 'ZWiK Zaganie' WHERE `Id` = 327; -- Żagańskie Wodociągi i Kanalizacje sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'ZM Zywiec Eko' WHERE `Id` = 328; -- Związek Międzygminny ds. Ekologii w Żywcu
UPDATE `Entities` SET `ShortName` = 'PGK Ogolny' WHERE `Id` = 329; -- Przedsiębiorstwo Gospodarki Komunalnej Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'Wody Polskie' WHERE `Id` = 330; -- Państwowe Gospodarstwo Wodne Wody Polskie
UPDATE `Entities` SET `ShortName` = 'ZUK Jaworzyna' WHERE `Id` = 331; -- Zakład Usług Komunalnych w Jaworzynie Śl. Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'PGKiM Antoniow' WHERE `Id` = 332; -- Przedsiębiorstwo Gospodarki Komunalnej i Mieszkaniowej Sp. z o.o. w Antoniowie
UPDATE `Entities` SET `ShortName` = 'RDOS Katowice' WHERE `Id` = 333; -- Regionalna Dyrekcja Ochrony Środowiska  w Katowicach
UPDATE `Entities` SET `ShortName` = 'INSTALBUD J.P.' WHERE `Id` = 334; -- Zakład Robót Instalacyjnych INSTALBUD J. Pankiewicz L. Lewicki
UPDATE `Entities` SET `ShortName` = 'PTB Sp. z o.o.' WHERE `Id` = 335; -- Przedsiębiorstwo Transportowo-Budowlane Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'UG Kornowac' WHERE `Id` = 336; -- Urząd Gminy Kornowac
UPDATE `Entities` SET `ShortName` = 'ZUK Miekini' WHERE `Id` = 339; -- Zakład Usług Komunalnych. Sp. z o. o. w Miękini
UPDATE `Entities` SET `ShortName` = 'TRAFFOFT' WHERE `Id` = 340; -- TRAFFOSFT sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'Gm. Prochowice' WHERE `Id` = 341; -- Gmina Prochowice
UPDATE `Entities` SET `ShortName` = 'Gm. Swidnica' WHERE `Id` = 343; -- Gmina Świdnica
UPDATE `Entities` SET `ShortName` = 'MPWiK S.A.' WHERE `Id` = 345; -- MPWiK S.A.
UPDATE `Entities` SET `ShortName` = 'Gm. Wolow' WHERE `Id` = 346; -- Gmina Wołów
UPDATE `Entities` SET `ShortName` = 'PW Sitkowski' WHERE `Id` = 347; -- Przedsiębiorstwo Wielobranżowe \"Sitkowski\" Piotr Sitkowski
UPDATE `Entities` SET `ShortName` = 'ZUK Chocianow' WHERE `Id` = 379; -- Zakład Usług Komunalnych i Transportu Publicznego Sp. z o.o. w Chocianowie
UPDATE `Entities` SET `ShortName` = 'Hydrowiert' WHERE `Id` = 380; -- Zakład Górniczy Hydrowiert Fitzner&Fitzner Sp z o.o.
UPDATE `Entities` SET `ShortName` = 'AWT Rekultiv.' WHERE `Id` = 388; -- AWT Rekultivace a.s.
UPDATE `Entities` SET `ShortName` = 'ZUZANPOL' WHERE `Id` = 391; -- P.W. ZUZANPOL Zuzanna Jaskóła
UPDATE `Entities` SET `ShortName` = 'PWiK Delfin' WHERE `Id` = 392; -- PWiK Delfin sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'OMEGA WOD-KAN' WHERE `Id` = 393; -- OMEGA Zakład Sieci WOD-KAN Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'Omega J. Irzyk' WHERE `Id` = 394; -- Omega Zakład Sieci Wodno-Kanalizacyjnych Jarosław Irzyk
UPDATE `Entities` SET `ShortName` = 'MAZPROK' WHERE `Id` = 395; -- Firma Inżynierska MAZPROK Piotr Mazur
UPDATE `Entities` SET `ShortName` = 'Clara Environ.' WHERE `Id` = 396; -- ClaraEnvironment Klara Ramm
UPDATE `Entities` SET `ShortName` = 'BERGER BAU' WHERE `Id` = 397; -- BERGER BAU POLSKA SP. Z O.O.
UPDATE `Entities` SET `ShortName` = 'HTS Sp. z o.o.' WHERE `Id` = 401; -- HTS Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'Abt Sp. z o.o.' WHERE `Id` = 402; -- Przedsiębiorstwo Budownictwa i Instalacji Abt Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'T4B Ekotechno' WHERE `Id` = 403; -- T4B Ekotechnologie Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'Szymbud' WHERE `Id` = 404; -- Grupa Szymbud Sp. z o.o. Sp. Kom
UPDATE `Entities` SET `ShortName` = 'ZWUK Biale Bl.' WHERE `Id` = 405; -- Zakład Wodociągów i Usług Komunalnych Sp. z o.o. w Białych Błotach
UPDATE `Entities` SET `ShortName` = 'ALLES COOL' WHERE `Id` = 409; -- ALLES COOL CHŁODNICTWO KLIMATYZACJA WENTYLACJA JACEK STEMPIN
UPDATE `Entities` SET `ShortName` = 'ZGK Czernichow' WHERE `Id` = 410; -- Gmina Czernichów, Odbiorca: Zakład Gospodarki Komunalnej w Czernichowie
UPDATE `Entities` SET `ShortName` = 'ZGK Szamotuly' WHERE `Id` = 411; -- Zakład Gospodarki Komunalnej w Szamotułach Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'EKOINSTAL' WHERE `Id` = 412; -- EKOINSTAL Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'AMELUX' WHERE `Id` = 413; -- AMELUX Wioletta Nowacka – Daniłów
UPDATE `Entities` SET `ShortName` = 'BUDEX Felinski' WHERE `Id` = 414; -- Przedsiębiorstwo Wielobranżowe „BUDEX” Michał Feliński
UPDATE `Entities` SET `ShortName` = 'MPWiK Milanow.' WHERE `Id` = 415; -- Milanowskie Przedsiębiorstwo Wodociągów i Kanalizacji sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'WiK Dzierzoniow' WHERE `Id` = 419; -- Wodociągi i Kanalizacja Spółka z o.o. Dzierżoniów
UPDATE `Entities` SET `ShortName` = 'Energy Sol. 1' WHERE `Id` = 420; -- Energy Solutions Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'Gm. Swierzawa' WHERE `Id` = 421; -- Gmina Świerzawa
UPDATE `Entities` SET `ShortName` = 'Envi Konsult.' WHERE `Id` = 422; -- Envi Konsulting
UPDATE `Entities` SET `ShortName` = 'MELBUD S.A.' WHERE `Id` = 427; -- MELBUD S.A.
UPDATE `Entities` SET `ShortName` = 'ZGK Jelcz' WHERE `Id` = 428; -- Zakład Gospodarki Komunalnej Sp. z o.o. w Jelczu-Laskowicach
UPDATE `Entities` SET `ShortName` = 'Gm. Wrzesnia' WHERE `Id` = 432; -- Gmina Września
UPDATE `Entities` SET `ShortName` = 'ZWiK Lomianki' WHERE `Id` = 433; -- Zakład Wodociągów i Kanalizacji w Łomiankach Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'Sad Okreg. Kat' WHERE `Id` = 434; -- Sąd Okręgowy w Katowicach XIII Wydział Gospodarczy
UPDATE `Entities` SET `ShortName` = 'POLINSTAL' WHERE `Id` = 435; -- POLINSTAL Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'ZWKiC' WHERE `Id` = 436; -- Zakład Wodociągów, Kanalizacji i Ciepłownictwa Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'Gm. Klodzko' WHERE `Id` = 437; -- Gmina Kłodzko
UPDATE `Entities` SET `ShortName` = 'MERCOMP' WHERE `Id` = 438; -- „MERCOMP SZCZECIN” Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'ROLLSTICK' WHERE `Id` = 440; -- ROLLSTICK Toruń Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'PWiK Wrzesnia' WHERE `Id` = 446; -- Przedsiębiorstwo Wodociągów i Kanalizacji Sp. z o.o. we Wrześni
UPDATE `Entities` SET `ShortName` = 'Gm. Niemcza' WHERE `Id` = 449; -- Gmina Niemcza
UPDATE `Entities` SET `ShortName` = 'VIRO Jaszczykow' WHERE `Id` = 450; -- PPHU VIRO Rober Jaszczykowski
UPDATE `Entities` SET `ShortName` = 'ZGK Scinawa' WHERE `Id` = 451; -- Zakład Gospodarki Komunalnej Sp. z o.o. w Ścinawie
UPDATE `Entities` SET `ShortName` = 'HYDROSAN' WHERE `Id` = 452; -- Biuro Projektów Gospodarki Wodno-Ściekowej HYDROSAN Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'MZK Polanica' WHERE `Id` = 453; -- Miejski Zakład Komunalny w Polanicy-Zdroju Spółka z o.o.
UPDATE `Entities` SET `ShortName` = 'ZDP Klodzko' WHERE `Id` = 454; -- Zarząd Dróg Powiatowych w Kłodzku
UPDATE `Entities` SET `ShortName` = 'Wod. Gm. Klodz.' WHERE `Id` = 455; -- „Wodociągi Gminy Kłodzko” sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'UG Klodzko' WHERE `Id` = 456; -- Urząd Gminy Kłodzko
UPDATE `Entities` SET `ShortName` = 'PWiK Zabki' WHERE `Id` = 457; -- Przedsiębiorstwo Wodociągów i Kanalizacji w Ząbkach sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'WUOZ Walbrzych' WHERE `Id` = 458; -- Wojewódzki Urząd Ochrony Zabytków Delegatura w Wałbrzychu
UPDATE `Entities` SET `ShortName` = 'Gm. Dusz. KZB' WHERE `Id` = 459; -- Gmina Duszniki - Komunalny Zakład Budżetowy
UPDATE `Entities` SET `ShortName` = 'PGK Wolow' WHERE `Id` = 460; -- Przedsiębiorstwo Gospodarki Komunalnej w Wołowie Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'ENVIROTECH' WHERE `Id` = 461; -- ENVIROTECH Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'Inerio Plutecki' WHERE `Id` = 462; -- Inerio Zbigniew Plutecki
UPDATE `Entities` SET `ShortName` = 'Gm. Przeworno' WHERE `Id` = 463; -- Gmina Przeworno
UPDATE `Entities` SET `ShortName` = 'Gm. Miekinia' WHERE `Id` = 464; -- Gmina Miękinia
UPDATE `Entities` SET `ShortName` = 'INFRACOMPLEX TW' WHERE `Id` = 465; -- INFRACOMPLEX TOMASZ WRZOSEK
UPDATE `Entities` SET `ShortName` = 'Park-M Poland' WHERE `Id` = 470; -- Park-M Poland Spółka z o.o.
UPDATE `Entities` SET `ShortName` = 'SK Design' WHERE `Id` = 471; -- SK Design Sylwia Grzondziel
UPDATE `Entities` SET `ShortName` = 'ABRYS Wysoczan' WHERE `Id` = 473; -- ,, ABRYS \"  OCHRONA WÓD STANISŁAW WYSOCZAŃSKI
UPDATE `Entities` SET `ShortName` = 'Energy Sol. 2' WHERE `Id` = 475; -- Energy Solutions Sp z o.o.
UPDATE `Entities` SET `ShortName` = 'Gliwice Miasto' WHERE `Id` = 476; -- Gliwice - miasto na prawach powiatu
UPDATE `Entities` SET `ShortName` = 'Retencjapl' WHERE `Id` = 478; -- Retencjapl Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'Gm. Stoszowice' WHERE `Id` = 479; -- Gmina Stoszowice
UPDATE `Entities` SET `ShortName` = 'PWiK Piotrkow' WHERE `Id` = 480; -- Piotrkowskie Wodociągi i Kanalizacja Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'INWEL' WHERE `Id` = 481; -- INWEL sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'Funnam' WHERE `Id` = 482; -- Funnam Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'Budimex S.A. 1' WHERE `Id` = 483; -- Budimex SA
UPDATE `Entities` SET `ShortName` = 'Wod. Marecki' WHERE `Id` = 484; -- Wodociąg Marecki SP. z o.o.
UPDATE `Entities` SET `ShortName` = 'JS J. Stepnik' WHERE `Id` = 485; -- Firma JS Jacek Stępnik
UPDATE `Entities` SET `ShortName` = 'INMEL' WHERE `Id` = 486; -- Przedsiębiorstwo Inżynieryjne INMEL Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'ZHU Jaranowski' WHERE `Id` = 487; -- Zakład Handlowo-Usługowy Arkadiusz Jaranowski
UPDATE `Entities` SET `ShortName` = 'Aarsleff' WHERE `Id` = 488; -- Aarsleff Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'Entalpia-X' WHERE `Id` = 489; -- Entalpia-X Spółka z ograniczoną odpowiedzialnością
UPDATE `Entities` SET `ShortName` = 'Gm. Gniezno' WHERE `Id` = 490; -- Gmina Gniezno
UPDATE `Entities` SET `ShortName` = 'Gm. Bolkow' WHERE `Id` = 491; -- Gmina Bolków
UPDATE `Entities` SET `ShortName` = 'HMK Sp. z o.o.' WHERE `Id` = 492; -- HMK Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'Gm. Wiazow' WHERE `Id` = 493; -- Gmina Wiązów
UPDATE `Entities` SET `ShortName` = 'NDI ENERGY' WHERE `Id` = 494; -- NDI ENERGY Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'MPGK Ogolny' WHERE `Id` = 495; -- Miejskie Przedsiębiorstwo Gospodarki Komunalnej spółka z ograniczoną odpowiedzialnością,
UPDATE `Entities` SET `ShortName` = 'ZUS Wojcik' WHERE `Id` = 496; -- Zakład Usług Studziennych Bernard Marian Wójcik Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'Gm. Strzelecki' WHERE `Id` = 497; -- Gmina Strzeleczki
UPDATE `Entities` SET `ShortName` = 'WPWiK Walbrz.' WHERE `Id` = 499; -- Wałbrzyskie Przedsiębiorstwo Wodociągów i Kanalizacji Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'WM Krakow' WHERE `Id` = 502; -- Wodociągi Miasta Krakowa Spółka Akcyjna
UPDATE `Entities` SET `ShortName` = 'Gm. Bogatynia' WHERE `Id` = 504; -- Gmina Bogatynia
UPDATE `Entities` SET `ShortName` = 'Techbud' WHERE `Id` = 505; -- Techbud sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'Gm. Marciszow' WHERE `Id` = 506; -- Gmina Marciszów
UPDATE `Entities` SET `ShortName` = 'Gm. Rudnik' WHERE `Id` = 507; -- Gmina Rudnik
UPDATE `Entities` SET `ShortName` = 'IAS Krakow' WHERE `Id` = 508; -- Izba Administracji Skarbowej w Krakowie
UPDATE `Entities` SET `ShortName` = 'Gm. Kepno' WHERE `Id` = 509; -- Gmina Kępno
UPDATE `Entities` SET `ShortName` = 'Kancelaria GNG' WHERE `Id` = 510; -- Kancelaria Adwokatów i Radców Prawnych Górecki, Nienartowicz, Grodziński s.c.
UPDATE `Entities` SET `ShortName` = 'Gm. Zary' WHERE `Id` = 511; -- Gmina Żary
UPDATE `Entities` SET `ShortName` = 'MPGK Wolin' WHERE `Id` = 512; -- Miejskie Przedsiębiorstwo Gospodarki Komunalnej Sp. z o.o. w Wolinie
UPDATE `Entities` SET `ShortName` = 'Gm. Nienachowo' WHERE `Id` = 513; -- Gmina Nienachowo
UPDATE `Entities` SET `ShortName` = 'ZUK Ogolny' WHERE `Id` = 514; -- Zakład Usług Komunalnych Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'Okechamp' WHERE `Id` = 515; -- Okechamp S.A.
UPDATE `Entities` SET `ShortName` = 'Gm. Granowo' WHERE `Id` = 516; -- Gmina Granowo
UPDATE `Entities` SET `ShortName` = 'SP N. Tomysl' WHERE `Id` = 517; -- Starostwo Powiatowe w Nowym Tomyślu
UPDATE `Entities` SET `ShortName` = 'Sredzka Woda' WHERE `Id` = 518; -- Średzka Woda Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'SM Na Skarpie' WHERE `Id` = 519; -- SPÓŁDZIELNIA MIESZKANIOWA \"NA SKARPIE\"
UPDATE `Entities` SET `ShortName` = 'Gm. Zabkowice' WHERE `Id` = 520; -- Gmina Ząbkowice Śląskie
UPDATE `Entities` SET `ShortName` = 'Solaris Bus' WHERE `Id` = 521; -- Solaris Bus & Coach Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'PB M. Peregrym' WHERE `Id` = 522; -- Przedsiębiorstwo Budowlane Mateusz Peregrym
UPDATE `Entities` SET `ShortName` = 'TECHRAMPS' WHERE `Id` = 523; -- TECHRAMPS Sp. z o.o. sp.k
UPDATE `Entities` SET `ShortName` = 'AK-BUD Korzen.' WHERE `Id` = 524; -- AK-BUD Zakład Ogólnobudowlany Andrzej Korzeniowski
UPDATE `Entities` SET `ShortName` = 'BRESSO' WHERE `Id` = 525; -- \"BRESSO\" Jan Bresso,
UPDATE `Entities` SET `ShortName` = 'Ekosystem' WHERE `Id` = 528; -- Ekosystem Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'Gm. Bardo' WHERE `Id` = 529; -- Gmina Bardo
UPDATE `Entities` SET `ShortName` = 'EKOWOD' WHERE `Id` = 530; -- Zakład Wodociągów i Usług Komunalnych „EKOWOD” Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'Powiat Turecki' WHERE `Id` = 531; -- Powiat Turecki
UPDATE `Entities` SET `ShortName` = 'Studio DK' WHERE `Id` = 532; -- Studio DK Sp. z o.o. Sp. K.
UPDATE `Entities` SET `ShortName` = 'PEC Walbrzych' WHERE `Id` = 533; -- PRZEDSIĘBIORSTWO ENERGETYKI CIEPLNEI S.A. W WAŁBRZYCHU
UPDATE `Entities` SET `ShortName` = 'CROWNPOL' WHERE `Id` = 534; -- CROWNPOL sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'ZGKiM Ogolny' WHERE `Id` = 535; -- Zakład Gospodarki Komunalnej i Mieszkaniowej
UPDATE `Entities` SET `ShortName` = 'RUK Radkow' WHERE `Id` = 536; -- Radkowskie usługi Komunalne Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'Terlan S.A.' WHERE `Id` = 537; -- Terlan S.A.
UPDATE `Entities` SET `ShortName` = 'Chemwik' WHERE `Id` = 538; -- Chemwik Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'Wod. Ostrzesz.' WHERE `Id` = 539; -- Wodociągi Ostrzeszowskie Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'APA ARCHES' WHERE `Id` = 540; -- APA ARCHES sp. z o.o. sp.k.
UPDATE `Entities` SET `ShortName` = 'PK Wieruszow' WHERE `Id` = 544; -- Przedsiębiorstwo Komunalne w Wieruszowie S.A.
UPDATE `Entities` SET `ShortName` = 'Bunge' WHERE `Id` = 545; -- Grupa Bunge
UPDATE `Entities` SET `ShortName` = 'NEXEN' WHERE `Id` = 546; -- NEXEN Technology Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'ZGK Psary' WHERE `Id` = 547; -- Zakład Gospodarki Komunalnej w Psarach Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'Poznan Miasto' WHERE `Id` = 548; -- Miasto Poznań
UPDATE `Entities` SET `ShortName` = 'ESP COMFORT' WHERE `Id` = 549; -- ESP COMFORT Sp z o.o.
UPDATE `Entities` SET `ShortName` = 'Instal-Serwis' WHERE `Id` = 550; -- F.H.U. Instal-Serwis Jacek Fabiańczyk
UPDATE `Entities` SET `ShortName` = 'Gm. Labiszyn' WHERE `Id` = 551; -- Gmina Łabiszyn
UPDATE `Entities` SET `ShortName` = 'Gm. Wloszakow.' WHERE `Id` = 552; -- Gmina Włoszakowice
UPDATE `Entities` SET `ShortName` = 'Gm. Mietkow' WHERE `Id` = 553; -- Gmina Mietków
UPDATE `Entities` SET `ShortName` = 'ZZM' WHERE `Id` = 554; -- Zarząd Zieleni Miejskiej
UPDATE `Entities` SET `ShortName` = 'KIO' WHERE `Id` = 555; -- Prezes Krajowej Izby Odwoławczej
UPDATE `Entities` SET `ShortName` = 'BI Sp. z o.o.' WHERE `Id` = 556; -- Biuro Inwestorskie Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'BBC Consultant' WHERE `Id` = 557; -- BBC Best Building Consultants sp. z o.o. sp.k.
UPDATE `Entities` SET `ShortName` = 'GDDKiA Bialyst' WHERE `Id` = 558; -- GENERALNA DYREKCJA DRÓG KRAJOWYCH I AUTOSTRAD ODDZIAŁ W BIAŁYMSTOKU
UPDATE `Entities` SET `ShortName` = 'ZWiK Smiechow.' WHERE `Id` = 559; -- Zakład Wodociągów i Kanalizacji Śmiechowice Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'SPEC BRUK' WHERE `Id` = 560; -- SPEC BRUK Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'UG Galewice' WHERE `Id` = 561; -- Urząd Gminy w Galewicach
UPDATE `Entities` SET `ShortName` = 'Gm. Dlugoleka' WHERE `Id` = 562; -- Gmina Długołęka GV
UPDATE `Entities` SET `ShortName` = 'SGK Sycow' WHERE `Id` = 563; -- Sycowska Gospodarka Komunalnej Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'LPWiK Legnica' WHERE `Id` = 564; -- Legnickie Przedsiębiorstwo Wodociągów i Kanalizacji S.A.
UPDATE `Entities` SET `ShortName` = 'ZGK Katy Wrocl' WHERE `Id` = 565; -- Zakład Gospodarki Komunalnej Sp. z o.o. Kąty Wrocławskie
UPDATE `Entities` SET `ShortName` = 'Uskom Kozuchow' WHERE `Id` = 566; -- Przedsiębiorstwo Usług Komunalnych Uskom Sp. z o.o. w Kożuchowie
UPDATE `Entities` SET `ShortName` = 'RPK Zlotoryja' WHERE `Id` = 567; -- Rejonowe Przedsiębiorstwo Komunalne Sp. z o.o. w Złotoryi
UPDATE `Entities` SET `ShortName` = 'EKOCENTRUM' WHERE `Id` = 568; -- EKOCENTRUM - Wrocławski Ośrodek Usług Ekologicznych Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'Woj. Kuj-Pom' WHERE `Id` = 569; -- Województwo Kujawsko-Pomorskie
UPDATE `Entities` SET `ShortName` = 'MPWiK Bedzin' WHERE `Id` = 570; -- Miejskie Przedsiębiorstwo Wodociągów i Kanalizacji sp. z o.o. w Będzinie
UPDATE `Entities` SET `ShortName` = 'Wod. Glucholaz' WHERE `Id` = 571; -- \"Wodociągi\" Sp. z o.o. , Głuchołazy
UPDATE `Entities` SET `ShortName` = 'Kobylarnia' WHERE `Id` = 572; -- Kobylarnia S.A.
UPDATE `Entities` SET `ShortName` = 'Mirbud' WHERE `Id` = 573; -- Mirbud S.A.
UPDATE `Entities` SET `ShortName` = 'KSWiK' WHERE `Id` = 574; -- Karkonoski System Wodociągów i Kanalizacji Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'Sad. Wodociagi' WHERE `Id` = 575; -- Sądeckie Wodociągi Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'SZB Siedlisko' WHERE `Id` = 576; -- Samorządowy Zakład Budżetowy w Siedlisku
UPDATE `Entities` SET `ShortName` = 'Esko-Consult.' WHERE `Id` = 577; -- \"Esko-Consulting\" Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'BRUK-POL' WHERE `Id` = 581; -- BRUK-POL M.Babik,J.Płonka s.c
UPDATE `Entities` SET `ShortName` = 'Lodz Miasto' WHERE `Id` = 582; -- Miasto Łódź
UPDATE `Entities` SET `ShortName` = 'Inz. Rzeszow' WHERE `Id` = 583; -- Inżynieria Rzeszów S.A.
UPDATE `Entities` SET `ShortName` = 'PPK Pniewy' WHERE `Id` = 584; -- Pniewskie Przedsiębiorstwo Komunalne sp. o.o.
UPDATE `Entities` SET `ShortName` = 'MPWiK Ogolny 3' WHERE `Id` = 585; -- Miejskie Przedsiębiorstwo Wodociągów i Kanalizacji Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'MPEC Bochnia' WHERE `Id` = 589; -- Miejskie Przedsiębiorstwo Energetyki Cieplnej Sp. z o.o. w Bochni
UPDATE `Entities` SET `ShortName` = 'KOMOPAL' WHERE `Id` = 590; -- Przedsiębiorstwo Gospodarki Komunalnej i Mieszkaniowej „KOMOPAL” Sp. z o.o
UPDATE `Entities` SET `ShortName` = 'EURO-PARK' WHERE `Id` = 591; -- EURO-PARK Ząbkowice sp. z o.o
UPDATE `Entities` SET `ShortName` = 'Budimex S.A. 2' WHERE `Id` = 598; -- Budimex S.A.
UPDATE `Entities` SET `ShortName` = 'LSSE' WHERE `Id` = 599; -- Legnicka Specjalna Strefa Ekonomiczna S.A.
UPDATE `Entities` SET `ShortName` = 'UMiG Skala' WHERE `Id` = 600; -- Urząd Miasta i Gminy w Skale
UPDATE `Entities` SET `ShortName` = 'ESIX' WHERE `Id` = 601; -- ESIX Sp. z o.o
UPDATE `Entities` SET `ShortName` = 'BIPROGEO' WHERE `Id` = 602; -- BIPROGEO Projekt Sp. zo.o.
UPDATE `Entities` SET `ShortName` = 'ARA IPP' WHERE `Id` = 603; -- ARA Independent Power Producer
UPDATE `Entities` SET `ShortName` = 'BIZ DROG' WHERE `Id` = 604; -- BIZ DROG Piotr Buczko i Paweł Zalewski sp. j.
UPDATE `Entities` SET `ShortName` = 'MIKO-TECH' WHERE `Id` = 605; -- MIKO-TECh Sp z o.o.
UPDATE `Entities` SET `ShortName` = 'UM Kielce' WHERE `Id` = 606; -- Urząd Miasta Kielce
UPDATE `Entities` SET `ShortName` = 'Wod. Kieleckie' WHERE `Id` = 607; -- Wodociągi Kieleckie Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'FIODOR' WHERE `Id` = 608; -- FIODOR Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'Gm. Dobra' WHERE `Id` = 609; -- Gmina Dobra
UPDATE `Entities` SET `ShortName` = 'PWiK Gliwice' WHERE `Id` = 613; -- Przedsiębiorstwo Wodociągów i Kanalizacji sp. z o.o. w Gliwicach
UPDATE `Entities` SET `ShortName` = 'Adamietz' WHERE `Id` = 620; -- Adamietz Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'SES Skawina' WHERE `Id` = 621; -- Spółdzielnia Energetyczna Skawina SES
UPDATE `Entities` SET `ShortName` = 'Gm. Czlopa' WHERE `Id` = 622; -- Gmina Człopa
UPDATE `Entities` SET `ShortName` = 'ZWK Świebodzin' WHERE `Id` = 623; -- Zakład Wodociągów, Kanalizacji i Usług Komunalnych Sp. z o.o. w Świebodzinie
UPDATE `Entities` SET `ShortName` = 'Gm. Tulowice' WHERE `Id` = 624; -- Gmina Tułowice
UPDATE `Entities` SET `ShortName` = 'PIM Poznan' WHERE `Id` = 628; -- Poznańskie Inwestycje Miejskie Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'ZWiK Ogolny' WHERE `Id` = 629; -- Zakład Wodociągów i Kanalizacji Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'E.CORAX' WHERE `Id` = 630; -- E.CORAX Sp. z o. o.
UPDATE `Entities` SET `ShortName` = 'Gm. Szczekocin' WHERE `Id` = 631; -- Gmina Szczekociny
UPDATE `Entities` SET `ShortName` = 'MPWiK Piekary' WHERE `Id` = 632; -- Miejskie Przedsiębiorstwo Wodociągów i Kanalizacji w Piekarach Śląskich Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'Gm. Steszew' WHERE `Id` = 633; -- Gmina Stęszew
UPDATE `Entities` SET `ShortName` = 'SuPeKom' WHERE `Id` = 634; -- Sulechowskie Przedsiębiorstwo Komunalne \"SuPeKom\" Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'ZIM Krakow' WHERE `Id` = 635; -- Zarząd Inwestycji Miejskich w Krakowie
UPDATE `Entities` SET `ShortName` = 'Cieplo-Jawor' WHERE `Id` = 636; -- Ciepło-Jawor Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'Inst. Nafty' WHERE `Id` = 637; -- Instytut Nafty i Gazu
UPDATE `Entities` SET `ShortName` = 'ZK Lisowice' WHERE `Id` = 638; -- Związek Komunalny \"Wodociąg Lisowice\"
UPDATE `Entities` SET `ShortName` = 'PPK Prochowice' WHERE `Id` = 639; -- Prochowickie Przedsiębiorstwo Komunalne Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'UM Wolin' WHERE `Id` = 640; -- Urząd Miejski w Wolinie
UPDATE `Entities` SET `ShortName` = 'Geologia Kubs.' WHERE `Id` = 641; -- Usługi Geologiczne i Handlowe Przemysław Kubsik
UPDATE `Entities` SET `ShortName` = 'Morawiec Trans' WHERE `Id` = 642; -- Morawiec Transport sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'NAVI-EXPERT' WHERE `Id` = 643; -- NAVI-EXPERT PS Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'MWiK Ogolny' WHERE `Id` = 653; -- Miejskie Wodociągi i Kanalizacja Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'Ostoya Capital' WHERE `Id` = 657; -- Ostoya Capital S.A.
UPDATE `Entities` SET `ShortName` = 'Skierniewice' WHERE `Id` = 658; -- Miasto Skierniewice
UPDATE `Entities` SET `ShortName` = 'Ragen' WHERE `Id` = 659; -- Ragen Sp. z o. o.
UPDATE `Entities` SET `ShortName` = 'Wod. Tarnow' WHERE `Id` = 660; -- Tarnowskie Wodociągi Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'UM Sulkowice' WHERE `Id` = 668; -- Urząd Miejski w Sułkowicach
UPDATE `Entities` SET `ShortName` = 'PGK Zyrardow 2' WHERE `Id` = 669; -- Przedsiębiorstwo Gospodarki Komunalnej PGK \"Żyrardów\"
UPDATE `Entities` SET `ShortName` = 'Gm. Kowary' WHERE `Id` = 670; -- Gmina Kowary
UPDATE `Entities` SET `ShortName` = 'Terra Mota' WHERE `Id` = 671; -- Terra Mota Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'Insbud' WHERE `Id` = 672; -- Przedsiębiorstwo Instalacji Sanitarnych Insbud Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'BUD-AN' WHERE `Id` = 673; -- BUD-AN Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'STRABAG Polud.' WHERE `Id` = 674; -- STRABAG Infrastruktura Południe Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'PIW i OS' WHERE `Id` = 675; -- Przedsiębiorstwo Inżynierii Wodnej i Ochrony Środowiska Sp. z o.o
UPDATE `Entities` SET `ShortName` = 'My Wave' WHERE `Id` = 676; -- My Wave Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'WiK Ogolny 2' WHERE `Id` = 677; -- Wodociągi i Kanalizacja Spółka z o.o.
UPDATE `Entities` SET `ShortName` = 'ZK Kleszczewo' WHERE `Id` = 681; -- Zakład Komunalny w Kleszczewie Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'WZWIK Walbrz' WHERE `Id` = 682; -- Wałbrzyski Związek Wodociągów i Kanalizacji
UPDATE `Entities` SET `ShortName` = 'ZGK Sw. Katarz' WHERE `Id` = 683; -- Zakład Gospodarki Komunalnej sp. z o.o. w Świętej Katarzynie
UPDATE `Entities` SET `ShortName` = 'ZWiK Swiecie' WHERE `Id` = 687; -- Zakład Wodociągów i Kanalizacji Sp. z o.o. Świecie
UPDATE `Entities` SET `ShortName` = 'MPO Lodz' WHERE `Id` = 688; -- Miejskie Przedsiębiorstwo Oczyszczania - Łódź Sp. z o. o.
UPDATE `Entities` SET `ShortName` = 'Wanicki' WHERE `Id` = 690; -- PT Wanicki Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'HYDRO-TAP' WHERE `Id` = 691; -- Przedsiębiorstwo Inżynieryjno Budowlane HYDRO-TAP Stanisław Kafel
UPDATE `Entities` SET `ShortName` = 'COMPLEX-BUD' WHERE `Id` = 692; -- LEON SZUTURMA PRZEDSIĘBIORSTWO BUDOWLANE ,,COMPLEX-BUD''
UPDATE `Entities` SET `ShortName` = 'SHN PRESS' WHERE `Id` = 693; -- SHN PRESS Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'MODUL' WHERE `Id` = 694; -- Przedsiębiorstwo Budowlane ,,MODUŁ'' Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'PK Prazmow' WHERE `Id` = 695; -- Przedsiębiorstwo Komunalne w Prażmowie Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'Prowod' WHERE `Id` = 696; -- Prowod Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'ZGK Sw. Kat. 2' WHERE `Id` = 697; -- Zakład Gospodarki Komunalnej Sp. z o.o. z siedzibą w Świętej Katarzynie
UPDATE `Entities` SET `ShortName` = 'Budimex Z.Gor' WHERE `Id` = 704; -- Budimex S.A.  Zielona Góra
UPDATE `Entities` SET `ShortName` = 'Gm. Czerwiensk' WHERE `Id` = 705; -- Gmina Czerwieńsk
UPDATE `Entities` SET `ShortName` = 'MZGK Chelmek 2' WHERE `Id` = 706; -- Miejski Zakład Gospodarki Komunalnej w Chełmku Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'GP Truck' WHERE `Id` = 707; -- GP Truck Trading s.c.
UPDATE `Entities` SET `ShortName` = 'PSM Metallbau' WHERE `Id` = 708; -- PSM Metallbau - Jaszkowic sp. k
UPDATE `Entities` SET `ShortName` = 'PWiK Oborniki' WHERE `Id` = 709; -- Przedsiębiorstwo Wodociągów i Kanalizacji w Obornikach Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'PWiK NYSA' WHERE `Id` = 710; -- Przedsiębiorstwo Wodociągów i Kanalizacji \"NYSA\" Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'Newater' WHERE `Id` = 711; -- Newater sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'MWiK N. Targ' WHERE `Id` = 712; -- Miejski Zakład Wodociągów i Kanalizacji w Nowym Targu sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'CZE Sp. z o.o.' WHERE `Id` = 713; -- Centrum Zielonej Energii Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'UG Lambinowice' WHERE `Id` = 714; -- Urząd Gminy w Łambinowicach
UPDATE `Entities` SET `ShortName` = 'Interhandler' WHERE `Id` = 715; -- Interhandler Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'Gm. Lambinow.' WHERE `Id` = 716; -- Gmina Łambinowice
UPDATE `Entities` SET `ShortName` = 'Gm. Kondratow.' WHERE `Id` = 717; -- Gmina Kondratowice
UPDATE `Entities` SET `ShortName` = 'PUK Bytkow' WHERE `Id` = 718; -- Przedsiębiorstwo Usług Komunalnych Sp. z o.o. w Bytkowie
UPDATE `Entities` SET `ShortName` = 'WODNIK J. Gor.' WHERE `Id` = 719; -- Przedsiębiorstwo Wodociągów i Kanalizacji WODNIK Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'UMiG Chocianow' WHERE `Id` = 720; -- Urząd Miasta i Gminy Chocianów
UPDATE `Entities` SET `ShortName` = 'Gm. Wilkow' WHERE `Id` = 721; -- Gmina Wilków
UPDATE `Entities` SET `ShortName` = 'Gm. Duszniki Z' WHERE `Id` = 728; -- Gmina Duszniki-Zdrój
UPDATE `Entities` SET `ShortName` = 'WASROB' WHERE `Id` = 729; -- WASROB Sp z o.o.
UPDATE `Entities` SET `ShortName` = 'UMiG Scinawa' WHERE `Id` = 730; -- Urząd Miasta i Gminy Ścinawa
UPDATE `Entities` SET `ShortName` = 'Castellum' WHERE `Id` = 731; -- Przedsiębiorstwo Budowlano-Konserwatorskie Castellum Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'PWiK Gorzow' WHERE `Id` = 732; -- Przedsiębiorstwo Wodociągów i Kanalizacji Sp. z o.o. w Gorzowie Wielkopolskim
UPDATE `Entities` SET `ShortName` = 'ZK Sp. z o.o.' WHERE `Id` = 733; -- Zakład Komunalny Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'Instal-Tech MP' WHERE `Id` = 734; -- Instal-Tech Monika Piechnat
UPDATE `Entities` SET `ShortName` = 'PWiK Kalisz' WHERE `Id` = 735; -- Przedsiębiorstwo Wodociągów i Kanalizacji Spółka z o.o. z/s w Kaliszu
UPDATE `Entities` SET `ShortName` = 'OPK Ozorkow' WHERE `Id` = 736; -- Ozorkowskie Przedsiębiorstwo Komunalne Sp. z o.o.
UPDATE `Entities` SET `ShortName` = 'HYDROMARKO SK' WHERE `Id` = 737; -- HYDROMARKO M PLUTA SPÓŁKA KOMANDYTOWA

COMMIT;