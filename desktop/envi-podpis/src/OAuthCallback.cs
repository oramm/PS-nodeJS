using System;
using System.Collections.Specialized;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web;

namespace EnviPodpis
{
    internal sealed class OAuthCallback : IDisposable
    {
        private readonly TcpListener listener;
        internal readonly string RedirectUri;

        internal OAuthCallback()
        {
            listener = new TcpListener(IPAddress.Loopback, 0);
            listener.Server.ExclusiveAddressUse = true;
            listener.Start(4);
            RedirectUri = "http://127.0.0.1:" + ((IPEndPoint)listener.LocalEndpoint).Port + "/" + DriveAuth.RandomText() + "/";
        }

        internal static string ValidateRequest(string request, string redirect, string state)
        {
            string[] lines = request.Split(new[] { "\r\n" }, StringSplitOptions.None);
            string[] first = lines[0].Split(' ');
            Uri expected = new Uri(redirect);
            if (first.Length != 3 || first[0] != "GET" || first[2] != "HTTP/1.1" ||
                !first[1].StartsWith(expected.AbsolutePath + "?", StringComparison.Ordinal)) throw new FormatException();
            int hosts = 0;
            foreach (string line in lines)
                if (line.StartsWith("Host:", StringComparison.OrdinalIgnoreCase))
                { hosts++; if (!string.Equals(line.Substring(5).Trim(), expected.Authority, StringComparison.Ordinal)) throw new FormatException(); }
            if (hosts != 1) throw new FormatException();
            NameValueCollection query = HttpUtility.ParseQueryString(first[1].Substring(expected.AbsolutePath.Length));
            if (query.GetValues("state") == null || query.GetValues("state").Length != 1 || query["state"] != state) throw new FormatException();
            if (query["error"] != null)
            {
                if (query["code"] != null) throw new FormatException();
                throw new InvalidOperationException("Nie udzielono zgody Google. Możesz zalogować się ponownie; sprawdź też dostęp konta do organizacji ENVI.");
            }
            string code = query["code"];
            if (string.IsNullOrEmpty(code) || code.Length > 4096 || query.GetValues("code").Length != 1) throw new FormatException();
            return code;
        }

        internal async Task<string> Receive(string state, CancellationToken cancellation)
        {
            try
            {
                using (cancellation.Register(delegate { listener.Stop(); }))
                {
                    for (int attempt = 0; attempt < 8; attempt++)
                    {
                        cancellation.ThrowIfCancellationRequested();
                        using (TcpClient client = await listener.AcceptTcpClientAsync().ConfigureAwait(false))
                        using (CancellationTokenSource requestLimit = CancellationTokenSource.CreateLinkedTokenSource(cancellation))
                        {
                            requestLimit.CancelAfter(TimeSpan.FromSeconds(5));
                            using (requestLimit.Token.Register(delegate { client.Close(); }))
                            {
                                try
                                {
                                    NetworkStream stream = client.GetStream();
                                    byte[] header = new byte[8192];
                                    int count = 0;
                                    while (count < header.Length)
                                    {
                                        int n = await stream.ReadAsync(header, count, 1, requestLimit.Token).ConfigureAwait(false);
                                        if (n == 0) throw new IOException();
                                        count += n;
                                        if (count >= 4 && header[count - 4] == 13 && header[count - 3] == 10 && header[count - 2] == 13 && header[count - 1] == 10) break;
                                    }
                                    if (count == header.Length) throw new IOException();
                                    string code = null;
                                    bool invalid = false;
                                    InvalidOperationException denied = null;
                                    try { code = ValidateRequest(Encoding.ASCII.GetString(header, 0, count), RedirectUri, state); }
                                    catch (FormatException) { invalid = true; }
                                    catch (InvalidOperationException ex) { denied = ex; }
                                    await Reply(stream, !invalid && denied == null, requestLimit.Token).ConfigureAwait(false);
                                    if (denied != null) throw denied;
                                    if (invalid) continue;
                                    return code;
                                }
                                catch (InvalidOperationException) { throw; }
                                catch (Exception) { cancellation.ThrowIfCancellationRequested(); }
                            }
                        }
                    }
                    throw new InvalidOperationException("Odrzucono nieprawidłowy powrót z Google. Rozpocznij logowanie ponownie.");
                }
            }
            catch (Exception)
            {
                cancellation.ThrowIfCancellationRequested();
                throw;
            }
            finally { listener.Stop(); }
        }

        private static async Task Reply(NetworkStream stream, bool success, CancellationToken cancellation)
        {
            byte[] body = Encoding.UTF8.GetBytes(success ? "Powrot odebrany. Wroc do ENVI Podpis, aby sprawdzic wynik logowania. Mozesz zamknac te karte." : "Nie potwierdzono logowania. Wroc do ENVI Podpis.");
            byte[] header = Encoding.ASCII.GetBytes("HTTP/1.1 " + (success ? "200 OK" : "400 Bad Request") + "\r\nContent-Type: text/plain; charset=utf-8\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nConnection: close\r\nContent-Length: " + body.Length + "\r\n\r\n");
            await stream.WriteAsync(header, 0, header.Length, cancellation).ConfigureAwait(false);
            await stream.WriteAsync(body, 0, body.Length, cancellation).ConfigureAwait(false);
        }
        public void Dispose() { listener.Stop(); }
    }
}
