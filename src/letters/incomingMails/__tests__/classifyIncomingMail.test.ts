import { classifyIncomingMail } from '../classifyIncomingMail';

/**
 * Kryterium z PRZ-4 stoi na jednej zasadzie: pomyłka ma spływać do `DO_DECYZJI`, nigdy do
 * `PISMO`. Fałszywe pismo zostaje w rejestrze i zakłada śmieciowy folder na Dysku; przeoczone
 * pismo czeka na liście i dorejestrowuje się jednym poleceniem przy tej samej kopercie.
 *
 * Dane są syntetyczne, ale kształt każdego przypadku pochodzi z próbki 34 prawdziwych maili
 * ze skrzynki firmowej (2026-07-31). Treści z tamtej próbki tu nie ma i być nie może.
 */

const STOPKA = { filename: 'image001.png', contentType: 'image/png', size: 4448 };
const pdf = (filename: string, size = 150_000) => ({
    filename,
    contentType: 'application/pdf',
    size,
});

const mail = (subject: string, body: string, attachments: any[] = []) =>
    classifyIncomingMail({ subject, body, attachments });

test('jeden PDF i zapowiedź pisma w treści to pismo, a stopka graficzna nie jest załącznikiem', () => {
    const wynik = mail('PZ 05/2026', 'W załączeniu pismo PZ 05/2026.', [
        STOPKA,
        pdf('PZ 05_2026 IK.pdf'),
    ]);

    expect(wynik.werdykt).toBe('PISMO');
    expect(wynik.pisma).toHaveLength(1);
    // Gdyby grafiki przechodziły, folder pisma na Dysku zapełniłby się logotypami nadawcy
    expect(wynik.zalaczniki).toHaveLength(0);
});

test('dwa dokumenty nie dają dwóch pism — z koperty nie widać, czy to pisma, czy załączniki', () => {
    const wynik = mail('TRB nr 41 — uzgodnienie zapisów', 'W załączniku przekazuję pismo i obliczenia.', [
        pdf('a.pdf'),
        pdf('b.pdf'),
    ]);

    expect(wynik.werdykt).toBe('DO_DECYZJI');
    expect(wynik.pisma).toHaveLength(0);
});

test('dokument bez słowa „pismo” w mailu nie jest rejestrowany automatycznie', () => {
    const wynik = mail('Raport nr 7 za lipiec', 'W załączeniu raport miesięczny.', [
        pdf('raport skan podpisany.pdf'),
    ]);

    expect(wynik.werdykt).toBe('DO_DECYZJI');
});

test('mail fakturowy nie zakłada pisma', () => {
    const wynik = mail('Potwierdzenie płatności – Faktura VAT 1/2026', 'W załączeniu faktura.', [
        pdf('Faktura-VAT 1-2026.pdf'),
    ]);

    expect(wynik.werdykt).toBe('BRAK');
    expect(wynik.pisma).toHaveLength(0);
});

test('zapowiedź pisma bije wykluczenie tematu — wezwanie dotyczące faktury zostaje pismem', () => {
    const wynik = mail(
        'Wezwanie do wystawienia faktury korygującej',
        'W załączeniu wezwanie.',
        [pdf('wezwanie.pdf')]
    );

    expect(wynik.werdykt).toBe('PISMO');
});

test('„oferty” w odmianie nie wywraca wykluczenia zarezerwowanego dla wysłanej oferty', () => {
    // Realny temat pisma IK: „polecenie przygotowania oferty …”. Gdyby wykluczenie łapało rdzeń
    // „ofert”, prawdziwe polecenie zmiany zniknęłoby z rejestru bez śladu.
    const wynik = mail(
        'UK — polecenie przygotowania oferty na sterowanie — pismo Ik nr 6014',
        'W załączeniu pismo IK nr 6014.',
        [pdf('6014 skan.pdf')]
    );

    expect(wynik.werdykt).toBe('PISMO');
});

test('zapowiedziane pismo bez dokumentu trafia na listę do decyzji, nie do kosza', () => {
    // Nadawca zapomniał załącznika albo wkleił link do dokumentu — oba przypadki są w próbce
    const wynik = mail('Propozycja pisma Ik nr 6160', 'Przekazuję propozycję odpowiedzi: <link>', [
        STOPKA,
    ]);

    expect(wynik.werdykt).toBe('DO_DECYZJI');
});

test('zwykła korespondencja bez załączników to koperta bez pisma', () => {
    expect(mail('RE: ustalenia z rady budowy', 'Zgadzam się, robimy tak.').werdykt).toBe('BRAK');
});
