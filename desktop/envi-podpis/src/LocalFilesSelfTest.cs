#if DEBUG
using System;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Windows.Forms;

namespace EnviPodpis
{
    internal static class LocalFilesSelfTest
    {
        private const BindingFlags Private = BindingFlags.Instance | BindingFlags.NonPublic;
        internal static void Run(string[] args, Action<bool, string> check)
        {
            string root = Path.Combine(WorkflowStore.Root, "folder-test"); Directory.CreateDirectory(root);
            string sub = Path.Combine(root, "Podfolder"); Directory.CreateDirectory(sub);
            File.WriteAllText(Path.Combine(root, "A.pdf"), "%PDF-fixture"); File.WriteAllText(Path.Combine(root, "B.PDF"), "%PDF-fixture");
            File.WriteAllText(Path.Combine(root, "ignore.txt"), "text"); File.WriteAllText(Path.Combine(sub, "nested.pdf"), "%PDF-fixture");
            check(LocalFilesForm.FavoritePaths().Contains(LocalFilesForm.Downloads), "local folders: Downloads available initially");
            LocalFilesForm.Pin(root, true); LocalFilesForm.Pin(root.ToUpperInvariant(), true);
            check(LocalFilesForm.FavoritePaths().Count(p => string.Equals(p, root, StringComparison.OrdinalIgnoreCase)) == 1, "local folders: pins persist without case duplicates");
            LocalFilesForm.Pin(sub, true); Directory.Delete(sub, true); LocalFilesForm.Pin(sub, false);
            check(!LocalFilesForm.FavoritePaths().Contains(sub), "local folders: disconnected pin can be removed");
            Directory.CreateDirectory(sub); File.WriteAllText(Path.Combine(sub, "nested.pdf"), "%PDF-fixture");
            using (LocalFilesForm form = new LocalFilesForm())
            {
                form.LoadFolder(root); form.ClientSize = new Size(740, 480);
                ListView list = (ListView)typeof(LocalFilesForm).GetField("list", Private).GetValue(form);
                check(list.Items.Count == 3 && !list.Items.Cast<ListViewItem>().Any(i => i.Text == "nested.pdf" || i.Text == "ignore.txt"), "local folders: direct PDFs and folders only, no recursive scan");
                form.Shown += delegate {
                    Application.DoEvents();
                    foreach (ListViewItem item in list.Items) item.Checked = true;
                    check(list.CheckedItems.Count == 2, "local folders: folders cannot be selected for signing");
                    list.Items.Cast<ListViewItem>().Single(i => i.Text == "B.PDF").Checked = false;
                    using (Bitmap bitmap = new Bitmap(form.Width, form.Height)) { form.DrawToBitmap(bitmap, new Rectangle(Point.Empty, form.Size)); bitmap.Save(Path.Combine(args[3], "local-folders.png")); }
                    Button add = Descendants(form).OfType<Button>().Single(b => b.Text == "Dodaj zaznaczone PDF"); add.PerformClick();
                };
                form.ShowDialog();
                check(form.SelectedPaths.Length == 1 && Path.GetFileName(form.SelectedPaths[0]) == "A.pdf", "local folders: only explicitly checked subset returned");
                check(Json.GetString(WorkflowStore.Settings(), "local.lastFolder") == root, "local folders: last folder remembered");
            }
            if (args.Length < 6) return;
            using (RSA key = RSA.Create(2048))
            using (X509Certificate2 cert = new CertificateRequest("CN=FOLDER TEST ONLY", key, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1).CreateSelfSigned(DateTimeOffset.Now.AddDays(-1), DateTimeOffset.Now.AddDays(1)))
            using (LocalForm form = new LocalForm(args[4]))
            {
                form.UseTestCertificate(cert);
                // Test the production review flag even though the certificate is synthetic.
                typeof(LocalForm).GetField("automaticReview", Private).SetValue(form, true);
                form.Shown += async delegate {
                    try {
                        await form.AddFiles(new[] { Path.Combine(args[5], "letter.pdf"), Path.Combine(args[5], "multi.pdf") }, null, false);
                        DataGridView files = (DataGridView)typeof(LocalForm).GetField("files", Private).GetValue(form);
                        check(files.Rows.Count == 2, "local folders: complete batch added before preview or PIN");
                        files.Rows[0].Cells[1].Value = false;
                        LocalDocument first = (LocalDocument)files.Rows[0].Tag, second = (LocalDocument)files.Rows[1].Tag;
                        check(!first.Graphic && second.Graphic && !first.SignAttempted && !second.SignAttempted, "local folders: independent graphic choice before any signature");
                        check(first.TargetDirectory == Path.GetDirectoryName(first.Source), "local folders: source sibling destination preserved");
                    } catch (Exception ex) { check(false, ex.ToString()); }
                    finally { form.Close(); }
                };
                Application.Run(form);
            }
        }
        private static System.Collections.Generic.IEnumerable<Control> Descendants(Control root)
        { foreach (Control child in root.Controls) { yield return child; foreach (Control nested in Descendants(child)) yield return nested; } }
    }
}
#endif
