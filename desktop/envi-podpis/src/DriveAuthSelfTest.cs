#if DEBUG
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web;
using System.Windows.Forms;

namespace EnviPodpis
{
    internal static class DriveAuthSelfTest
    {
        private const string ClientId = "618971825086-synthetic.apps.googleusercontent.com";
        private const string Secret = "synthetic-client-secret-never-real";
        private static string ClientJson(string authUri = "https://accounts.google.com/o/oauth2/auth")
        {
            return Json.Serialize(new { installed = new { client_id = ClientId, client_secret = Secret,
                project_id = "envi-podpis", auth_uri = authUri, token_uri = DriveAuth.TokenUrl } });
        }
        private static object Token(string scopes = DriveAuth.Scope)
        {
            return new Dictionary<string, object> { { "access_token", "synthetic-access" }, { "refresh_token", "synthetic-refresh" },
                { "token_type", "Bearer" }, { "expires_in", 3600 }, { "scope", scopes } };
        }
        private static bool Reject(Action action)
        { try { action(); return false; } catch (Exception ex) { return !ex.Message.Contains(Secret) && !ex.Message.Contains("synthetic-access"); } }
        private static async Task<bool> Cancelled(Func<Task> action)
        { try { await action(); return false; } catch (OperationCanceledException) { return true; } }

        internal static void Run(string[] args, Action<bool, string> check)
        {
            string root = Path.Combine(Path.GetTempPath(), "envi-podpis-oauth-test-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(root);
            try
            {
                DriveAuth auth = new DriveAuth(Path.Combine(root, "account"));
                string clientPath = Path.Combine(root, "synthetic-client.json");
                File.WriteAllText(clientPath, ClientJson(), new UTF8Encoding(false));
                if (args[2] == "oauthui")
                {
                    if (args.Length > 3)
                    {
                        auth.Import(clientPath);
                        if (args[3] == "remembered") { object data = auth.Read(); Json.AsObject(data)["refresh_token"] = "synthetic-refresh"; auth.Write(data); }
                    }
                    if (args.Length > 3 && args[3] == "corrupt") File.WriteAllBytes(Path.Combine(root, "account", "account.dpapi"), new byte[] { 1, 2, 3 });
                    using (DriveLoginForm form = new DriveLoginForm(auth))
                    { if (args.Length > 3) form.ClientSize = new System.Drawing.Size(550, 310); Application.Run(form); }
                    return;
                }
                FormStates(auth, clientPath, root, check);
                check(!auth.Configured && !auth.Connected, "brak konfiguracji nie tworzy credentiali");
                check(Json.GetString(DriveAuth.ParseClient(ClientJson()), "client_id") == ClientId, "oficjalny ksztalt JSON Desktop");
                check(Json.GetString(DriveAuth.ParseClient(ClientJson(DriveAuth.AuthorizeUrl)), "project_id") == "envi-podpis", "akceptowany endpoint v2 Google");
                check(Reject(delegate { DriveAuth.ParseClient(ClientJson().Replace("envi-podpis", "PS-server")); }), "obcy projekt odrzucony");
                check(Reject(delegate { DriveAuth.ParseClient(ClientJson().Replace("installed", "web")); }), "klient web odrzucony");
                check(Reject(delegate { DriveAuth.ParseClient(ClientJson().Replace(DriveAuth.TokenUrl, "https://evil.invalid/token")); }), "obcy endpoint tokenu odrzucony");
                check(Reject(delegate { DriveAuth.ParseClient(ClientJson("https://evil.invalid/auth")); }), "obcy endpoint zgody odrzucony");
                check(Reject(delegate { DriveAuth.ParseClient("{bad"); }), "bledny JSON bez surowej tresci w bledzie");
                check(Reject(delegate { DriveAuth.ParseClient(new string('x', 65537)); }), "ograniczenie rozmiaru konfiguracji");
                auth.Import(clientPath);
                string store = Path.Combine(root, "account", "account.dpapi");
                byte[] encrypted = File.ReadAllBytes(store);
                check(auth.Configured && !auth.Connected, "import konfiguracji nie jest logowaniem");
                check(File.ReadAllText(clientPath) == ClientJson(), "oryginalny JSON zachowany bajtowo");
                check(!Encoding.UTF8.GetString(encrypted).Contains(Secret), "sekret nie jest tekstem w magazynie");
                check(Json.GetString(auth.Read(), "client_secret") == Secret, "DPAPI CurrentUser roundtrip");
                check(Reject(delegate { ProtectedData.Unprotect(encrypted, Encoding.UTF8.GetBytes("other-app"), DataProtectionScope.CurrentUser); }), "obcy kontekst DPAPI odrzucony");
                FileSystemAccessRule[] rules = new DirectoryInfo(Path.Combine(root, "account")).GetAccessControl()
                    .GetAccessRules(true, true, typeof(SecurityIdentifier)).Cast<FileSystemAccessRule>().ToArray();
                check(rules.Length == 1 && rules[0].IdentityReference.Equals(WindowsIdentity.GetCurrent().User), "katalog prywatny dla biezacego uzytkownika");
                File.WriteAllText(clientPath, "invalid");
                check(Reject(delegate { auth.Import(clientPath); }) && File.ReadAllBytes(store).SequenceEqual(encrypted), "nieudany import zachowuje poprzednia konfiguracje");
                File.WriteAllText(clientPath, ClientJson());
                File.WriteAllBytes(store, new byte[] { 1, 2, 3 });
                check(Reject(delegate { auth.Read(); }), "uszkodzony magazyn wymaga ponownego importu");
                auth.Import(clientPath);
                check(DriveAuth.Challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk") == "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", "PKCE S256: wektor RFC 7636");
                string random = DriveAuth.RandomText();
                check(random.Length == 43 && random != DriveAuth.RandomText() && random.All(c => char.IsLetterOrDigit(c) || c == '-' || c == '_'), "losowe state/verifier: 256 bitow, base64url");

                string redirect = "http://127.0.0.1:45678/test/";
                Func<string, string> request = query => "GET /test/?" + query + " HTTP/1.1\r\nHost: 127.0.0.1:45678\r\n\r\n";
                check(OAuthCallback.ValidateRequest(request("state=expected&code=synthetic-code"), redirect, "expected") == "synthetic-code", "powrot Google: prawidlowy state i code");
                foreach (string query in new[] { "state=bad&code=x", "code=x", "state=expected", "state=expected&code=x&code=y", "state=expected&state=expected&code=x", "state=expected&error=access_denied&code=x" })
                    check(Reject(delegate { OAuthCallback.ValidateRequest(request(query), redirect, "expected"); }), "odrzucony nieprawidlowy powrot " + query.Split('&').Length);
                check(Reject(delegate { OAuthCallback.ValidateRequest(request("state=expected&code=x").Replace("Host: 127.0.0.1", "Host: evil.invalid"), redirect, "expected"); }), "obcy Host odrzucony");
                check(Reject(delegate { OAuthCallback.ValidateRequest(request("state=expected&code=x").Replace("GET", "POST"), redirect, "expected"); }), "obca metoda HTTP odrzucona");
                check(Reject(delegate { OAuthCallback.ValidateRequest(request("state=expected&code=x").Replace("/test/?", "/other/?"), redirect, "expected"); }), "obca sciezka odrzucona");
                check(Reject(delegate { OAuthCallback.ValidateRequest(request("state=expected&error=access_denied"), redirect, "expected"); }), "odmowa zgody z poprawnym state");
                DriveAuth.ValidateToken(Token(), true);
                check(Reject(delegate { DriveAuth.ValidateToken(Token("https://www.googleapis.com/auth/drive.file"), true); }), "drive.file nie zastapi zakresu drive");
                check(Reject(delegate { DriveAuth.ValidateToken(new { error = "invalid_grant", error_description = Secret }, false); }), "cofnieta zgoda bez surowego opisu Google");
                object missingRefresh = Token(); Json.AsObject(missingRefresh).Remove("refresh_token");
                check(Reject(delegate { DriveAuth.ValidateToken(missingRefresh, true); }), "brak refresh tokenu przy logowaniu odrzucony");
                object noScope = Token(); Json.AsObject(noScope).Remove("scope");
                check(Reject(delegate { DriveAuth.ValidateToken(noScope, true); }), "brak potwierdzenia zakresu przy logowaniu odrzucony");
                Task.Run(async delegate { await Flows(auth, Path.Combine(root, "account"), check); }).GetAwaiter().GetResult();
                check(Directory.GetFiles(Path.Combine(root, "account"), "*.tmp").Length == 0, "brak tymczasowego pliku po zapisie");
            }
            finally { Directory.Delete(root, true); }
        }

        private static System.Reflection.FieldInfo Field(DriveLoginForm form, string name)
        { return form.GetType().GetField(name, System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic); }

        private static void Refresh(DriveLoginForm form)
        { form.GetType().GetMethod("RefreshState", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic).Invoke(form, null); }

        private static void FormStates(DriveAuth auth, string clientPath, string root, Action<bool, string> check)
        {
            using (DriveLoginForm form = new DriveLoginForm(auth))
            {
                Button login = (Button)Field(form, "login").GetValue(form);
                Button logout = (Button)Field(form, "logout").GetValue(form);
                Button import = (Button)Field(form, "import").GetValue(form);
                Button cancel = (Button)Field(form, "cancel").GetValue(form);
                check(!login.Enabled && !logout.Enabled && import.Enabled, "UI bez konfiguracji: tylko import");
                auth.Import(clientPath); Refresh(form);
                check(login.Enabled && !logout.Enabled, "UI po imporcie: mozna sie zalogowac");
                object data = auth.Read(); Json.AsObject(data)["refresh_token"] = "synthetic-refresh"; auth.Write(data); Refresh(form);
                check(!login.Enabled && logout.Enabled, "UI po logowaniu: login nieaktywny, logout aktywny");
                using (CancellationTokenSource operation = new CancellationTokenSource())
                {
                    Field(form, "operation").SetValue(form, operation); Refresh(form);
                    check(!login.Enabled && !logout.Enabled && !import.Enabled && cancel.Text == "Przerwij", "UI trwajacej operacji blokuje zmiany konta");
                    Field(form, "operation").SetValue(form, null); Refresh(form);
                }
                form.Show(); logout.PerformClick(); form.Hide();
                check(login.Enabled && !logout.Enabled && auth.Configured, "UI po wylogowaniu: ponowny login bez importu");
                data = auth.Read(); Json.AsObject(data)["refresh_token"] = "synthetic-refresh"; auth.Write(data); Refresh(form);
                File.WriteAllBytes(Path.Combine(root, "account", "account.dpapi"), new byte[] { 1, 2, 3 });
                form.Show(); logout.PerformClick(); form.Hide();
                check(!login.Enabled && !logout.Enabled && import.Enabled &&
                    ((Label)Field(form, "status").GetValue(form)).Text.Contains("Nie można odczytać"), "UI blad konfiguracji: login/logout zablokowane, import dostepny");
            }
            File.Delete(Path.Combine(root, "account", "account.dpapi"));
        }
        private static async Task Flows(DriveAuth auth, string accountDirectory, Action<bool, string> check)
        {
            int posts = 0;
            string verifierChallenge = null;
            Task browser = null;
            auth.OpenBrowser = delegate(string url) {
                var q = HttpUtility.ParseQueryString(new Uri(url).Query);
                verifierChallenge = q["code_challenge"];
                check(url.StartsWith(DriveAuth.AuthorizeUrl + "?", StringComparison.Ordinal) && !url.Contains(Secret) &&
                    q["code_challenge_method"] == "S256" && q["scope"] == DriveAuth.Scope && q["hd"] == "envi.com.pl" && q["login_hint"] == null, "URL zgody: Google/PKCE/drive bez sekretu");
                browser = Task.Run(async delegate {
                    using (HttpClientHandler handler = new HttpClientHandler { UseProxy = false })
                    using (HttpClient client = new HttpClient(handler))
                    {
                        HttpResponseMessage wrong = await client.GetAsync(q["redirect_uri"] + "?state=wrong&code=invalid");
                        check(wrong.StatusCode == HttpStatusCode.BadRequest, "bledny state nie konczy oczekiwania"); wrong.Dispose();
                        using (HttpResponseMessage ok = await client.GetAsync(q["redirect_uri"] + "?state=" + q["state"] + "&code=synthetic-code"))
                        { check(ok.IsSuccessStatusCode && !(await ok.Content.ReadAsStringAsync()).Contains("synthetic-code"), "loopback nie odsyla kodu do przegladarki"); }
                    }
                });
            };
            auth.Post = delegate(string endpoint, string body, CancellationToken ct) {
                posts++;
                var q = HttpUtility.ParseQueryString(body);
                check(endpoint == DriveAuth.TokenUrl && q["code"] == "synthetic-code" && DriveAuth.Challenge(q["code_verifier"]) == verifierChallenge &&
                    q["client_id"] == ClientId && q["client_secret"] == Secret && q["grant_type"] == "authorization_code", "wymiana kodu: verifier i osobny klient Desktop");
                object response = Token();
                Json.AsObject(response)["refresh_token"] = posts == 1 ? "synthetic-refresh" : "synthetic-other-account";
                return Task.FromResult(response);
            };
            await auth.Login(CancellationToken.None); await browser;
            check(auth.Connected && posts == 1, "pelne logowanie mock przez rzeczywisty loopback");
            check(await auth.GetAccessToken(CancellationToken.None) == "synthetic-access" && posts == 1, "token w pamieci bez zbednego odswiezania");
            DriveAuth fresh = new DriveAuth(accountDirectory);
            fresh.Post = delegate(string endpoint, string body, CancellationToken ct) {
                var q = HttpUtility.ParseQueryString(body);
                check(q["grant_type"] == "refresh_token" && q["refresh_token"] == "synthetic-refresh", "restart aplikacji odswieza zgode z DPAPI");
                object result = Token(); Json.AsObject(result).Remove("scope"); Json.AsObject(result)["refresh_token"] = "synthetic-rotated";
                return Task.FromResult(result);
            };
            check(await fresh.GetAccessToken(CancellationToken.None) == "synthetic-access" && Json.GetString(fresh.Read(), "refresh_token") == "synthetic-rotated", "rotacja refresh tokenu zachowana");
            fresh.Logout();
            check(!fresh.Connected && fresh.Configured, "wylogowanie usuwa token i zachowuje konfiguracje");
            check(Reject(delegate { fresh.GetAccessToken(CancellationToken.None).GetAwaiter().GetResult(); }), "wylogowana aplikacja nie uzywa cache tokenu");
            check(Reject(delegate { auth.GetAccessToken(CancellationToken.None).GetAwaiter().GetResult(); }), "wylogowanie w drugim oknie uniewaznia cache pierwszego");
            auth.Logout();
            await auth.Login(CancellationToken.None); await browser;
            check(auth.Connected && posts == 2 && Json.GetString(auth.Read(), "refresh_token") == "synthetic-other-account", "ponowne logowanie po logout: nowa zgoda, bez przypiecia konta");
            auth.Logout();
            using (CancellationTokenSource stop = new CancellationTokenSource())
            using (OAuthCallback callback = new OAuthCallback())
            {
                string uri = callback.RedirectUri;
                Task<string> waiting = callback.Receive("synthetic", stop.Token); stop.Cancel();
                check(await Cancelled(async delegate { await waiting; }), "anulowanie zamyka oczekiwanie callback");
                using (TcpClient probe = new TcpClient())
                { check(Reject(delegate { probe.Connect(IPAddress.Loopback, new Uri(uri).Port); }), "anulowanie zwalnia port loopback"); }
            }
            auth.OpenBrowser = delegate { throw new IOException("synthetic-launch-failure"); };
            check(Reject(delegate { auth.Login(CancellationToken.None).GetAwaiter().GetResult(); }) && !auth.Connected, "blad przegladarki bez zapisu zgody");
            using (CancellationTokenSource stop = new CancellationTokenSource())
            {
                int beforePosts = posts;
                auth.OpenBrowser = delegate { stop.Cancel(); };
                check(await Cancelled(async delegate { await auth.Login(stop.Token); }) && !auth.Connected && beforePosts == posts, "przerwane logowanie bez token exchange i zapisu zgody");
            }
            auth.OpenBrowser = delegate(string url) {
                var q = HttpUtility.ParseQueryString(new Uri(url).Query);
                browser = Task.Run(async delegate {
                    using (HttpClientHandler handler = new HttpClientHandler { UseProxy = false })
                    using (HttpClient client = new HttpClient(handler))
                    using (HttpResponseMessage response = await client.GetAsync(q["redirect_uri"] + "?state=" + q["state"] + "&error=access_denied"))
                    { check(response.StatusCode == HttpStatusCode.BadRequest, "odmowa Google: odpowiedz loopback"); }
                });
            };
            bool denied = false;
            try { await auth.Login(CancellationToken.None); } catch (InvalidOperationException ex) { denied = ex.Message.Contains("zgody"); }
            await browser;
            check(denied && !auth.Connected && posts == 2, "odmowa zgody nie wywoluje endpointu tokenu");
            object remembered = auth.Read(); Json.AsObject(remembered)["refresh_token"] = "synthetic-revoked"; auth.Write(remembered);
            auth.Post = delegate { return Task.FromResult<object>(new { error = "invalid_grant", error_description = Secret }); };
            check(Reject(delegate { auth.GetAccessToken(CancellationToken.None).GetAwaiter().GetResult(); }), "cofnieta zgoda przy odswiezaniu: bez tokenu i bez surowego bledu");
            auth.Logout();
        }

    }
}
#endif
