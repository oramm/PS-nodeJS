using System;

namespace EnviPodpis
{
    // Komunikat dla uzytkownika: co sie stalo, i co zrobic dalej. Bez zargonu.
    internal sealed class ErrorInfo
    {
        public string Title;
        public string Message;
        public string NextStep;
        public string Technical;        // pokazywany malym drukiem, do zgloszenia
        public string CancelReason;     // powod wysylany do PS przy anulowaniu zlecenia
    }

    internal static class Messages
    {
        private const string RetryInPs = "Wróć do PS i kliknij „Podpisz” jeszcze raz.";

        public static string Plural(int n, string one, string few, string many)
        {
            if (n == 1) return one;
            int mod10 = n % 10;
            int mod100 = n % 100;
            if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return few;
            return many;
        }

        public static string FilesCount(int n)
        {
            return n + " " + Plural(n, "plik", "pliki", "plików");
        }

        public static ErrorInfo FromApi(ApiException ex)
        {
            ErrorInfo e = new ErrorInfo();
            e.CancelReason = "api_error";
            if (ex.NoConnection)
            {
                e.Title = "Brak połączenia z PS";
                e.Message = "Nie mogę połączyć się z PS. Sprawdź, czy komputer ma dostęp do internetu.";
                e.NextStep = RetryInPs;
                return e;
            }
            if (ex.TimedOut)
            {
                e.Title = "PS nie odpowiada";
                e.Message = "PS nie odpowiedział na czas. Nic nie zostało podpisane.";
                e.NextStep = "Wróć do PS, sprawdź, czy strona działa, i kliknij „Podpisz” jeszcze raz.";
                return e;
            }
            switch (ex.Status)
            {
                case 404:
                case 410:
                    e.Title = "Zlecenie wygasło albo zostało już użyte";
                    e.Message = "To zlecenie podpisu jest już nieważne. Zlecenie działa kilka minut i można go użyć tylko raz.";
                    e.NextStep = RetryInPs;
                    return e;
                case 401:
                case 403:
                    e.Title = "PS nie przyjął zlecenia";
                    e.Message = "To zlecenie nie należy do Twojego konta albo nie masz do niego uprawnień.";
                    e.NextStep = "Zaloguj się w PS na swoje konto i kliknij „Podpisz” jeszcze raz.";
                    e.Technical = "HTTP " + ex.Status;
                    return e;
                case 409:
                    e.Title = "Zlecenie jest w innym stanie";
                    e.Message = "PS informuje, że to zlecenie nie może teraz być wykonane" + Suffix(ex.ServerMessage);
                    e.NextStep = RetryInPs;
                    e.Technical = "HTTP 409";
                    return e;
            }
            if (ex.Status >= 500)
            {
                e.Title = "PS ma chwilowy problem";
                e.Message = "PS zgłosił błąd po swojej stronie. Nic nie zostało podpisane" + Suffix(ex.ServerMessage);
                e.NextStep = "Poczekaj chwilę i kliknij w PS „Podpisz” jeszcze raz. Jeśli błąd się powtarza, zgłoś to.";
                e.Technical = "HTTP " + ex.Status;
                return e;
            }
            e.Title = "PS odrzucił zapytanie";
            e.Message = "PS nie przyjął zapytania programu" + Suffix(ex.ServerMessage);
            e.NextStep = RetryInPs;
            e.Technical = ex.Status > 0 ? "HTTP " + ex.Status : ex.Message;
            return e;
        }

        private static string Suffix(string serverMessage)
        {
            if (string.IsNullOrEmpty(serverMessage)) return ".";
            return ": " + serverMessage;
        }

        public static ErrorInfo FromJobStatus(string status)
        {
            ErrorInfo e = new ErrorInfo();
            e.CancelReason = null; // nie ruszamy zlecenia, ktore i tak jest zakonczone
            string s = (status ?? "").ToLowerInvariant();
            if (s == "expired")
            {
                e.Title = "Zlecenie wygasło";
                e.Message = "To zlecenie podpisu jest już nieważne. Zlecenie działa kilka minut.";
                e.NextStep = RetryInPs;
            }
            else if (s == "cancelled" || s == "canceled")
            {
                e.Title = "Zlecenie zostało anulowane";
                e.Message = "To zlecenie zostało wcześniej anulowane, więc niczego nie podpisuję.";
                e.NextStep = RetryInPs;
            }
            else if (s == "done")
            {
                e.Title = "To zlecenie jest już wykonane";
                e.Message = "Pliki z tego zlecenia zostały już podpisane. Podpisane pliki są w folderze pisma w PS.";
                e.NextStep = "Nic więcej nie trzeba robić.";
            }
            else
            {
                e.Title = "Zlecenie zakończyło się błędem";
                e.Message = "PS oznaczył to zlecenie jako nieudane, więc niczego nie podpisuję.";
                e.NextStep = RetryInPs;
            }
            e.Technical = null;
            return e;
        }

        public static ErrorInfo OutdatedProgram(string minVersion)
        {
            ErrorInfo e = new ErrorInfo();
            e.Title = "Ta wersja programu jest za stara";
            e.Message = "PS wymaga nowszej wersji programu ENVI Podpis (co najmniej " + minVersion + "). Masz wersję " + Config.FormatVersion(Config.CurrentVersion) + ". Niczego nie podpisano.";
            e.NextStep = "Wróć do PS, pobierz nową wersję programu z okna podpisu i uruchom ją jednym dwukliknięciem.";
            e.Technical = null;
            e.CancelReason = null; // zlecenie zostaje, PS pokaze pobranie nowej wersji
            return e;
        }

        public static ErrorInfo NoCertificate(int skippedNonRsa)
        {
            ErrorInfo e = new ErrorInfo();
            e.Title = "Nie widzę karty z podpisem";
            if (skippedNonRsa > 0)
            {
                e.Message = "Windows widzi certyfikat do podpisu, ale program nie umie jeszcze podpisywać kluczem tego rodzaju. Niczego nie podpisano.";
                e.NextStep = "W PS użyj „Wgraj podpisany”: podpiszesz plik innym programem i wgrasz go do PS.";
            }
            else
            {
                e.Message = "Nie widzę karty w czytniku albo Windows nie pokazuje na niej certyfikatu do podpisu kwalifikowanego.";
                e.NextStep = "Włóż kartę do czytnika (po włożeniu Windows potrzebuje kilku sekund) i kliknij „Szukaj ponownie”.";
            }
            e.CancelReason = "no_certificate";
            return e;
        }

        public static ErrorInfo FromSigning(SigningException ex, int total)
        {
            ErrorInfo e = new ErrorInfo();
            e.Technical = ex.Technical;
            e.CancelReason = "signing_" + ex.Kind.ToString();
            string partial = ex.Index > 0
                ? " Poprzednie pliki (" + ex.Index + ") podpisały się, ale PS dostaje podpisy dopiero po podpisaniu wszystkich, więc nic nie zostało zapisane."
                : " Nic nie zostało podpisane ani wysłane do PS.";
            switch (ex.Kind)
            {
                case SigningFailure.WrongPin:
                    e.Title = "Karta nie przyjęła PIN-u";
                    e.Message = "Karta odrzuciła PIN." + partial + " Uwaga: karta liczy błędne próby i po kilku blokuje się. Program nie ponawia PIN-u sam.";
                    e.NextStep = "Wróć do PS i kliknij „Podpisz” jeszcze raz, wpisując PIN uważnie. Jeśli nie jesteś pewien PIN-u, nie próbuj więcej.";
                    break;
                case SigningFailure.PinBlocked:
                    e.Title = "Karta zablokowała PIN";
                    e.Message = "Karta zablokowała się po zbyt wielu błędnych próbach PIN-u." + partial;
                    e.NextStep = "Odblokowanie wymaga kodu PUK od wystawcy karty. Tymczasem w PS możesz użyć „Wgraj podpisany”.";
                    break;
                case SigningFailure.NoCard:
                    e.Title = "Nie widzę karty w czytniku";
                    e.Message = "Nie widzę karty w czytniku albo czytnik przestał odpowiadać." + partial;
                    e.NextStep = "Sprawdź, czy karta jest włożona do końca, a potem w PS kliknij „Podpisz” jeszcze raz.";
                    break;
                case SigningFailure.Cancelled:
                    e.Title = "Wpisywanie PIN-u przerwane";
                    e.Message = "Okno PIN-u karty zostało zamknięte bez podania PIN-u." + partial;
                    e.NextStep = RetryInPs;
                    break;
                case SigningFailure.InvalidResult:
                    e.Title = "Karta nie zwróciła poprawnego podpisu";
                    e.Message = "To, co zwróciła karta, nie jest prawidłowym podpisem. Najczęściej oznacza to błędny PIN albo problem z kartą." + partial + " Karta mogła policzyć tę próbę jako błędny PIN.";
                    e.NextStep = "Wróć do PS i kliknij „Podpisz” jeszcze raz, ale najpierw upewnij się co do PIN-u. Jeśli problem się powtórzy, zgłoś to.";
                    break;
                case SigningFailure.UnsupportedKey:
                    e.Title = "Tej karty program jeszcze nie obsługuje";
                    e.Message = "Windows udostępnia klucz tej karty w sposób, którego program nie umie jeszcze użyć." + partial;
                    e.NextStep = "W PS użyj „Wgraj podpisany”: podpiszesz plik innym programem i wgrasz go do PS.";
                    break;
                default:
                    e.Title = "Podpisywanie nie powiodło się";
                    e.Message = "Karta albo czytnik zgłosiły błąd. Najczęstsze przyczyny to błędny PIN albo wyjęta karta." + partial;
                    e.NextStep = "Sprawdź kartę i PIN, a potem w PS kliknij „Podpisz” jeszcze raz. Jeśli błąd się powtarza, zgłoś to i podaj kod z dołu okna.";
                    break;
            }
            return e;
        }

        public static ErrorInfo CodesDiffer()
        {
            ErrorInfo e = new ErrorInfo();
            e.Title = "Kody kontrolne się nie zgadzają";
            e.Message = "PS podał inny kod kontrolny, niż wynika z pliku, który program miałby podpisać. Dla bezpieczeństwa niczego nie podpisuję.";
            e.NextStep = "Wróć do PS i kliknij „Podpisz” jeszcze raz. Jeśli to się powtórzy, zgłoś to.";
            e.CancelReason = "check_code_mismatch";
            return e;
        }

        public static ErrorInfo WrongFileCount()
        {
            ErrorInfo e = new ErrorInfo();
            e.Title = "Lista plików się nie zgadza";
            e.Message = "PS przygotował inną liczbę plików, niż była na liście zlecenia. Dla bezpieczeństwa niczego nie podpisuję.";
            e.NextStep = "Wróć do PS i kliknij „Podpisz” jeszcze raz. Jeśli to się powtórzy, zgłoś to.";
            e.CancelReason = "file_count_mismatch";
            return e;
        }

        public static ErrorInfo SendFailed(ApiException ex)
        {
            ErrorInfo e = FromApi(ex);
            e.CancelReason = null; // podpisy mogly dojsc do PS - nie anulujemy
            if (ex.NoConnection || ex.TimedOut)
            {
                e.Title = "Nie wiem, czy PS dostał podpisy";
                e.Message = "Podpisy zostały złożone, ale nie dostałem potwierdzenia z PS.";
                e.NextStep = "Najpierw sprawdź w PS, czy podpisane pliki są już w folderze pisma. Nie podpisuj ponownie, dopóki tego nie sprawdzisz.";
            }
            else
            {
                e.Message = e.Message + " Podpisy zostały złożone, ale PS ich nie zapisał.";
            }
            return e;
        }

        public static ErrorInfo Unexpected(Exception ex)
        {
            ErrorInfo e = new ErrorInfo();
            e.Title = "Coś poszło nie tak";
            e.Message = "Program napotkał nieoczekiwany błąd. Niczego nie podpisano.";
            e.NextStep = RetryInPs + " Jeśli błąd się powtarza, zgłoś to i podaj kod z dołu okna.";
            e.Technical = ex.GetType().Name + ": " + ex.Message;
            e.CancelReason = "program_error";
            return e;
        }
    }
}
