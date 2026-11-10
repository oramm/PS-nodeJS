#if DEBUG
using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace EnviPodpis
{
    internal static class RecoverySelfTest
    {
        private static T Field<T>(LocalForm form, string name)
        { return (T)typeof(LocalForm).GetField(name, BindingFlags.NonPublic | BindingFlags.Instance).GetValue(form); }

        internal static void Run(string output, Action<bool, string> check)
        {
            Directory.CreateDirectory(WorkflowStore.Root);
            string directory = Path.Combine(WorkflowStore.Root, "copies"); Directory.CreateDirectory(directory);
            byte[] bytes = new byte[] { 37, 80, 68, 70, 45 };
            var removed = new LocalDocument { Source = Path.Combine(directory, "stary.pdf"), ValidatedCopy = bytes };
            WorkflowStore.Retain(removed);
            string oldPath = removed.RecoveryPath;
            WorkflowStore.Dismiss(removed);
            string archived = Path.Combine(WorkflowStore.Root, "dismissed", Path.GetFileName(oldPath));
            check(File.Exists(archived) && Json.GetString(WorkflowStore.Read(archived), "pdf") == Convert.ToBase64String(bytes), "dismiss keeps encrypted signed bytes in archive");
            check(!WorkflowStore.Recover(message => check(false, message)).Any(), "dismissed entry does not return on restart");
            WorkflowStore.Dismiss(removed);
            check(removed.RecoveryPath == null, "dismiss is safe when repeated");
            var bad = new LocalDocument { Source = Path.Combine(WorkflowStore.Root, "missing", "error.pdf"), ValidatedCopy = bytes };
            var good = new LocalDocument { Source = Path.Combine(directory, "wniosek popr..pdf"), ValidatedCopy = bytes };
            WorkflowStore.Retain(bad); WorkflowStore.Retain(good);
            using (LocalForm form = new LocalForm("unused-test-package"))
            {
                form.ClientSize = new Size(1000, 650);
                form.Shown += async delegate {
                    try
                    {
                        var docs = Field<List<LocalDocument>>(form, "documents");
                        var grid = Field<DataGridView>(form, "files");
                        var save = Field<Button>(form, "save");
                        var actions = Field<FlowLayoutPanel>(form, "actions");
                        var tips = Field<ToolTip>(form, "tips");
                        check(actions.Controls.Cast<Control>().All(c => !string.IsNullOrEmpty(tips.GetToolTip(c))) && !string.IsNullOrEmpty(tips.GetToolTip(save)), "action buttons explain their effects with tooltips");
                        foreach (LocalDocument doc in docs.ToList())
                        {
                            grid.ClearSelection();
                            grid.Rows.Cast<DataGridViewRow>().Single(r => r.Tag == doc).Selected = true;
                            save.PerformClick();
                            for (int n = 0; n < 100 && Field<bool>(form, "busy"); n++) await Task.Delay(20);
                            check(!Field<bool>(form, "busy"), "retry finishes without card or PIN");
                            if (doc.Source == bad.Source)
                                check(doc.Error != null && doc.Status.Contains("podpis zachowany") && File.Exists(doc.RecoveryPath), "retry failure is visible on row and preserves pending signed copy");
                            else
                                check(doc.Status == "Zapisano" && File.ReadAllBytes(doc.Output).SequenceEqual(bytes) && doc.RecoveryPath == null, "retry of recovered double-dot filename saves the exact preserved bytes");
                        }
                        using (Bitmap bitmap = new Bitmap(form.Width, form.Height)) { form.DrawToBitmap(bitmap, form.ClientRectangle); bitmap.Save(output); }
                        grid.ClearSelection(); grid.Rows.Cast<DataGridViewRow>().Single(r => ((LocalDocument)r.Tag).Source == bad.Source).Selected = true;
                        ((Button)actions.Controls.Cast<Control>().Single(c => c.Text == "Usuń z listy")).PerformClick();
                        check(docs.Count == 1 && grid.Rows.Count == 1 && !WorkflowStore.Recover(message => check(false, message)).Any(), "remove button clears undelivered entry durably");
                        check(Directory.GetFiles(directory, "*.pdf").Length == 1, "remove leaves saved PDF intact");
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
