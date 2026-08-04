import { MongoClient } from 'mongodb';
import { keys } from './credentials';

/**
 * Kasuje sesje wskazanej osoby z magazynu sesji (MongoDB, kolekcja `sessions`).
 *
 * PO CO. Rola systemowa trafia do sesji raz, przy logowaniu (ToolsGapi.loginHandler),
 * i nic jej potem nie odświeża. Sesja żyje 30 dni z `rolling: true`, więc osobie, która
 * korzysta z witryny codziennie, nie wygasa praktycznie nigdy. Bez tego kroku odebranie
 * komuś uprawnień (np. przeniesienie pracownika ENVI na rolę pracownika kontraktowego)
 * zaczynałoby obowiązywać dopiero wtedy, gdy sam się wyloguje - czyli w praktyce nigdy.
 *
 * KSZTAŁT DANYCH. connect-mongo zapisuje sesję jako `{_id, expires, session}`, gdzie
 * `session` to łańcuch JSON zawierający `"userData":{"enviId":608,...}`. Stąd dopasowanie
 * po fragmencie tekstu - z domykającym `,` albo `}`, żeby enviId 12 nie złapało 123.
 *
 * Osobne połączenie zamiast współdzielonego klienta z index.ts: import z index.ts w
 * warstwie kontrolerów zamyka cykl (index → routery → kontrolery). Zmiana roli to
 * czynność rzadka i administracyjna, więc koszt otwarcia połączenia jest bez znaczenia.
 */
export default class SessionRevoker {
    /**
     * Usuwa wszystkie sesje osoby. Zwraca liczbę skasowanych sesji.
     * Nigdy nie rzuca: unieważnienie sesji jest skutkiem ubocznym zapisu roli i nie może
     * wywrócić samego zapisu. Niepowodzenie jest głośne w logu.
     */
    static async revokeForPerson(personId: number): Promise<number> {
        if (!Number.isInteger(personId) || personId <= 0) return 0;

        const uri = process.env.MONGO_URI || keys.mongoDb.uri;
        if (!uri) {
            console.error(
                '[SessionRevoker] Brak MONGO_URI - nie da się unieważnić sesji osoby %d',
                personId
            );
            return 0;
        }

        const client = new MongoClient(uri);
        try {
            await client.connect();
            const result = await client
                .db()
                .collection('sessions')
                .deleteMany({
                    session: {
                        $regex: `"enviId":${personId}[,}]`,
                    },
                });

            console.log(
                '[SessionRevoker] Unieważniono sesje osoby %d: %d',
                personId,
                result.deletedCount
            );
            return result.deletedCount ?? 0;
        } catch (error) {
            console.error(
                '[SessionRevoker] Nie udało się unieważnić sesji osoby %d: %s',
                personId,
                error instanceof Error ? error.message : String(error)
            );
            return 0;
        } finally {
            await client.close().catch(() => {});
        }
    }
}
