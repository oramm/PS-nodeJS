using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace EnviPodpis
{
    internal sealed class DriveAuth
    {
        internal const string Scope = "https://www.googleapis.com/auth/drive";
        internal const string AuthorizeUrl = "https://accounts.google.com/o/oauth2/v2/auth";
        internal const string TokenUrl = "https://oauth2.googleapis.com/token";
        private readonly string directory;
        private string accessToken;
        private string cachedClient;
        private string cachedRefresh;
        private DateTime accessUntil;
        private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("ENVI Podpis Desktop OAuth v1");
        internal Func<string, string, CancellationToken, Task<object>> Post = PostGoogle;
        internal Action<string> OpenBrowser = delegate(string url) { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); };

        internal DriveAuth(string dataDirectory = null)
        {
            // Settings live outside the manifest-owned installation directory.
            directory = dataDirectory ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"ENVI\PodpisData\GoogleDrive");
        }

        internal bool Configured { get { return File.Exists(StorePath); } }
        internal bool Connected { get { return !string.IsNullOrEmpty(Json.GetString(Read(), "refresh_token")); } }
        private string StorePath { get { return Path.Combine(directory, "account.dpapi"); } }

        internal static object ParseClient(string text)
        {
            try
            {
                if (text == null || text.Length > 65536) throw new FormatException();
                object installed = null;
                IDictionary<string, object> root = Json.AsObject(Json.Parse(text));
                if (root == null || !root.TryGetValue("installed", out installed)) throw new FormatException();
                string id = Json.GetString(installed, "client_id");
                string secret = Json.GetString(installed, "client_secret");
                if (Json.GetString(installed, "project_id") != "envi-podpis" || string.IsNullOrEmpty(id) ||
                    id.Length > 256 || !id.EndsWith(".apps.googleusercontent.com", StringComparison.Ordinal) ||
                    string.IsNullOrEmpty(secret) || secret.Length > 256 ||
                    (Json.GetString(installed, "auth_uri") != AuthorizeUrl && Json.GetString(installed, "auth_uri") != "https://accounts.google.com/o/oauth2/auth") || Json.GetString(installed, "token_uri") != TokenUrl)
                    throw new FormatException();
                return new Dictionary<string, object> { { "client_id", id }, { "client_secret", secret }, { "project_id", "envi-podpis" } };
            }
            catch (Exception) { throw new InvalidOperationException("Wybierz JSON klienta aplikacji komputerowej z projektu envi-podpis. Nie używaj konfiguracji serwera PS."); }
        }

        internal void Import(string path)
        {
            try
            {
                using (FileStream file = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read))
                {
                    if (file.Length > 65536) throw new IOException();
                    using (StreamReader reader = new StreamReader(file, Encoding.UTF8, true))
                    {
                        object client = ParseClient(reader.ReadToEnd());
                        Write(client);
                        accessToken = null;
                    }
                }
            }
            catch (Exception) { throw new InvalidOperationException("Nie zaimportowano konfiguracji. Wybierz dostępny JSON klienta Desktop z projektu envi-podpis. Plik źródłowy pozostaje bez zmian."); }
        }

        internal object Read()
        {
            if (!Configured) return new Dictionary<string, object>();
            byte[] clear = null;
            try
            {
                if (new FileInfo(StorePath).Length > 65536 || (File.GetAttributes(StorePath) & FileAttributes.ReparsePoint) != 0) throw new IOException();
                clear = ProtectedData.Unprotect(File.ReadAllBytes(StorePath), Entropy, DataProtectionScope.CurrentUser);
                object data = Json.Parse(Encoding.UTF8.GetString(clear));
                if (Json.AsObject(data) == null) throw new FormatException();
                return data;
            }
            catch (Exception) { throw new InvalidOperationException("Nie można odczytać chronionej konfiguracji Google. Zaimportuj JSON ponownie na tym koncie Windows."); }
            finally { if (clear != null) Array.Clear(clear, 0, clear.Length); }
        }

        internal void Write(object value)
        {
            byte[] clear = Encoding.UTF8.GetBytes(Json.Serialize(value));
            string temporary = null;
            try
            {
                DirectoryInfo folder = Directory.CreateDirectory(directory);
                if ((folder.Attributes & FileAttributes.ReparsePoint) != 0) throw new IOException();
                DirectorySecurity acl = new DirectorySecurity();
                acl.SetAccessRuleProtection(true, false);
                acl.AddAccessRule(new FileSystemAccessRule(WindowsIdentity.GetCurrent().User, FileSystemRights.FullControl,
                    InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));
                folder.SetAccessControl(acl);
                byte[] encrypted = ProtectedData.Protect(clear, Entropy, DataProtectionScope.CurrentUser);
                temporary = Path.Combine(directory, Guid.NewGuid().ToString("N") + ".tmp");
                using (FileStream file = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                { file.Write(encrypted, 0, encrypted.Length); file.Flush(true); }
                if (File.Exists(StorePath)) File.Replace(temporary, StorePath, null);
                else File.Move(temporary, StorePath);
            }
            catch (Exception) { throw new InvalidOperationException("Nie zapisano chronionej konfiguracji Google. Sprawdź wolne miejsce i uprawnienia swojego konta Windows."); }
            finally
            {
                Array.Clear(clear, 0, clear.Length);
                if (temporary != null && File.Exists(temporary)) File.Delete(temporary);
            }
        }

        internal void Logout()
        {
            object data = Read();
            Json.AsObject(data).Remove("refresh_token");
            Write(data);
            accessToken = null;
        }

        internal async Task Login(CancellationToken cancellation)
        {
            object data = Read();
            if (string.IsNullOrEmpty(Json.GetString(data, "client_id"))) throw new InvalidOperationException("Najpierw wybierz pobrany JSON konfiguracji Google.");
            using (CancellationTokenSource limit = CancellationTokenSource.CreateLinkedTokenSource(cancellation))
            using (OAuthCallback callback = new OAuthCallback())
            {
                limit.CancelAfter(TimeSpan.FromMinutes(3));
                string verifier = RandomText();
                string state = RandomText();
                string url = AuthorizeUrl + "?" + Form(new Dictionary<string, string> {
                    { "client_id", Json.GetString(data, "client_id") }, { "redirect_uri", callback.RedirectUri },
                    { "response_type", "code" }, { "scope", Scope }, { "state", state },
                    { "code_challenge", Challenge(verifier) }, { "code_challenge_method", "S256" },
                    { "access_type", "offline" }, { "prompt", "consent" }, { "hd", "envi.com.pl" }
                });
                try
                {
                    cancellation.ThrowIfCancellationRequested();
                    try { OpenBrowser(url); }
                    catch (Exception) { throw new InvalidOperationException("Nie otwarto przeglądarki. Ustaw domyślną przeglądarkę Windows i spróbuj ponownie."); }
                    string code = await callback.Receive(state, limit.Token);
                    object result = await Post(TokenUrl, Form(new Dictionary<string, string> {
                        { "client_id", Json.GetString(data, "client_id") }, { "client_secret", Json.GetString(data, "client_secret") },
                        { "code", code }, { "code_verifier", verifier }, { "redirect_uri", callback.RedirectUri }, { "grant_type", "authorization_code" }
                    }), limit.Token);
                    ValidateToken(result, true);
                    limit.Token.ThrowIfCancellationRequested();
                    Json.AsObject(data)["refresh_token"] = Json.GetString(result, "refresh_token");
                    Write(data);
                    Cache(result, data);
                }
                catch (OperationCanceledException)
                {
                    if (cancellation.IsCancellationRequested) throw;
                    throw new InvalidOperationException("Upłynął czas logowania. Kliknij Zaloguj Google, aby rozpocząć ponownie.");
                }
            }
        }

        internal async Task<string> GetAccessToken(CancellationToken cancellation)
        {
            cancellation.ThrowIfCancellationRequested();
            object data = Read();
            string refresh = Json.GetString(data, "refresh_token");
            if (string.IsNullOrEmpty(refresh)) throw new InvalidOperationException("Zaloguj się ponownie do Google.");
            if (accessToken != null && cachedClient == Json.GetString(data, "client_id") && cachedRefresh == refresh && accessUntil > DateTime.UtcNow) return accessToken;
            object result = await Post(TokenUrl, Form(new Dictionary<string, string> {
                { "client_id", Json.GetString(data, "client_id") }, { "client_secret", Json.GetString(data, "client_secret") },
                { "refresh_token", refresh }, { "grant_type", "refresh_token" }
            }), cancellation);
            ValidateToken(result, false);
            cancellation.ThrowIfCancellationRequested();
            string next = Json.GetString(result, "refresh_token");
            if (!string.IsNullOrEmpty(next)) { Json.AsObject(data)["refresh_token"] = next; Write(data); }
            Cache(result, data);
            return accessToken;
        }

        private void Cache(object result, object data)
        {
            accessToken = Json.GetString(result, "access_token");
            cachedClient = Json.GetString(data, "client_id");
            cachedRefresh = Json.GetString(data, "refresh_token");
            accessUntil = DateTime.UtcNow.AddSeconds(Math.Max(0, Json.GetInt(result, "expires_in", 0) - 60));
        }

        internal static void ValidateToken(object result, bool login)
        {
            string error = Json.GetString(result, "error");
            if (error != null) throw new InvalidOperationException(error == "invalid_grant" ?
                "Zgoda Google wygasła lub została cofnięta. Zaloguj się ponownie." :
                "Google odmówił logowania. Sprawdź konfigurację klienta i zasady organizacji ENVI.");
            string scopes = Json.GetString(result, "scope");
            if (string.IsNullOrEmpty(Json.GetString(result, "access_token")) ||
                !string.Equals(Json.GetString(result, "token_type"), "Bearer", StringComparison.OrdinalIgnoreCase) ||
                Json.GetInt(result, "expires_in", 0) <= 0 ||
                (login && (string.IsNullOrEmpty(Json.GetString(result, "refresh_token")) || scopes == null)) ||
                (scopes != null && !scopes.Split(' ').Contains(Scope)))
                throw new InvalidOperationException("Google nie udzielił wymaganego dostępu do Dysku. Zaloguj się ponownie i sprawdź zgodę oraz zakres drive.");
        }

        private static async Task<object> PostGoogle(string endpoint, string body, CancellationToken cancellation)
        {
            if (endpoint != TokenUrl) throw new InvalidOperationException("Nieprawidłowy adres logowania Google.");
            using (HttpClientHandler handler = new HttpClientHandler { AllowAutoRedirect = false, UseCookies = false })
            using (HttpClient client = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(30), MaxResponseContentBufferSize = 65536 })
            using (StringContent content = new StringContent(body, Encoding.UTF8, "application/x-www-form-urlencoded"))
            {
                try
                {
                    using (HttpResponseMessage response = await client.PostAsync(endpoint, content, cancellation).ConfigureAwait(false))
                    {
                        object result = Json.Parse(await response.Content.ReadAsStringAsync().ConfigureAwait(false));
                        if (!response.IsSuccessStatusCode && Json.GetString(result, "error") == null) throw new IOException();
                        return result;
                    }
                }
                catch (OperationCanceledException)
                {
                    cancellation.ThrowIfCancellationRequested();
                    throw new InvalidOperationException("Google nie odpowiedział w ciągu 30 sekund. Sprawdź połączenie i spróbuj ponownie.");
                }
                catch (Exception) { throw new InvalidOperationException("Nie otrzymano poprawnej odpowiedzi Google. Sprawdź połączenie i spróbuj ponownie."); }
            }
        }

        internal static string RandomText()
        {
            byte[] random = new byte[32];
            using (RandomNumberGenerator rng = RandomNumberGenerator.Create()) rng.GetBytes(random);
            return Base64Url(random);
        }
        private static string Base64Url(byte[] bytes) { return Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_'); }
        internal static string Challenge(string verifier) { using (SHA256 hash = SHA256.Create()) return Base64Url(hash.ComputeHash(Encoding.ASCII.GetBytes(verifier))); }
        internal static string Form(IDictionary<string, string> values)
        { return string.Join("&", values.Select(p => Uri.EscapeDataString(p.Key) + "=" + Uri.EscapeDataString(p.Value)).ToArray()); }
    }
}
