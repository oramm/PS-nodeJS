#if DEBUG
using System;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace EnviPodpis
{
    internal static class LoadingSelfTest
    {
        private const BindingFlags Private = BindingFlags.Instance | BindingFlags.NonPublic;
        internal static void Run(string output, Action<bool, string> check)
        {
            using (OutlookSourceForm outlook = new OutlookSourceForm())
            {
                typeof(OutlookSourceForm).GetMethod("ShowLoading", Private).Invoke(outlook, new object[] { "Ładowanie PDF: pismo.pdf. Poczekaj…" });
                check(outlook.UseWaitCursor && ((Label)typeof(OutlookSourceForm).GetField("status", Private).GetValue(outlook)).Text.Contains("Ładowanie PDF"), "Outlook: komunikat i kursor przed blokujacym odczytem zalacznika");
            }
            using (MailSourceForm mail = new MailSourceForm("synthetic-only"))
            {
                MethodInfo busy = typeof(MailSourceForm).GetMethod("Busy", Private);
                Button add = (Button)typeof(MailSourceForm).GetField("add", Private).GetValue(mail);
                busy.Invoke(mail, new object[] { true });
                check(mail.UseWaitCursor && !add.Enabled, "IMAP: kursor oczekiwania i blokada ponownego pobierania");
                busy.Invoke(mail, new object[] { false });
                check(!mail.UseWaitCursor && add.Enabled, "IMAP: koniec operacji przywraca kontrole");
            }
            using (RSA key = RSA.Create(2048))
            using (X509Certificate2 cert = new CertificateRequest("CN=LOADING TEST ONLY", key, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1).CreateSelfSigned(DateTimeOffset.Now.AddDays(-1), DateTimeOffset.Now.AddDays(1)))
            using (LocalForm form = new LocalForm("synthetic-only"))
            {
                form.UseTestCertificate(cert); form.ClientSize = new Size(780, 560);
                ProgressBar progress = (ProgressBar)typeof(LocalForm).GetField("progress", Private).GetValue(form);
                MethodInfo operation = typeof(LocalForm).GetMethod("WithOperation", Private);
                Label note = (Label)typeof(LocalForm).GetField("note", Private).GetValue(form);
                form.Shown += async delegate {
                    try
                    {
                        await (Task)operation.Invoke(form, new object[] { (Func<Task>)(async delegate {
                            await Task.Delay(200);
                            check(progress.Visible && progress.Style == ProgressBarStyle.Marquee && progress.Width > 100 && progress.Height >= 8, "przygotowanie PDF: widoczny pasek aktywnosci takze w oknie 780x560");
                            check(note.Text.Contains("Trwa przygotowanie"), "komunikat jest widoczny przed rozpoczeciem pracy");
                            using (Bitmap bitmap = new Bitmap(form.Width, form.Height)) { form.DrawToBitmap(bitmap, new Rectangle(Point.Empty, form.Size)); bitmap.Save(Path.Combine(output, "loading-window.png")); }
                            await Task.Delay(600);
                        }) });
                        check(!progress.Visible, "sukces chowa pasek");
                        await (Task)operation.Invoke(form, new object[] { (Func<Task>)(delegate { throw new IOException("synthetic failure"); }) });
                        check(!progress.Visible && note.Text == "synthetic failure", "blad chowa pasek i zachowuje komunikat bledu");
                        await (Task)operation.Invoke(form, new object[] { (Func<Task>)(delegate { throw new OperationCanceledException(); }) });
                        check(!progress.Visible && note.Text.Contains("Przerwano"), "anulowanie chowa pasek i pokazuje wynik");
                    }
                    catch (Exception ex) { check(false, ex.ToString()); }
                    finally { form.Close(); }
                };
                Application.Run(form);
            }
        }
    }
}
#endif
