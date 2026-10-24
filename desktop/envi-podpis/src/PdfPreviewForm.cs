using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace EnviPodpis
{
    internal sealed class PdfPreviewForm : Form
    {
        private readonly PictureBox picture = new PictureBox();
        private readonly Panel viewport = new Panel();
        private readonly TextBox page = new TextBox();
        private readonly Button previous = new Button();
        private readonly Button next = new Button();
        private readonly Button retry = new Button();
        private readonly NumericUpDown left = new NumericUpDown();
        private readonly NumericUpDown top = new NumericUpDown();
        private readonly Label note = new Label();
        private readonly Button accept = new Button();
        private readonly FlowLayoutPanel position = new FlowLayoutPanel();
        private readonly PdfWorker worker;
        private readonly LocalDocument document;
        private readonly List<object> pages;
        private readonly bool manual;
        private readonly object initialPlacement;
        private readonly CancellationTokenSource cancel = new CancellationTokenSource();
        private int requestedPage;
        private int renderedPage;
        private bool rendering;
        private bool closing;
        private bool chosen;
        private bool settingPosition;
        private bool dragging;
        private PointF dragOffset;
        private bool startAtBottom;
        private bool initialView = true;
        public object SelectedPlacement;

        public PdfPreviewForm(LocalDocument doc, PdfWorker client, bool choose)
        {
            document = doc; worker = client; manual = choose;
            pages = Json.GetList(doc.Info, "pages");
            if (pages.Count < 1) throw new IOException("PDF nie zawiera stron do podglądu.");
            initialPlacement = Json.Parse(Json.Serialize(doc.Placement));
            requestedPage = ClampPage(Json.GetInt(manual ? initialPlacement : Json.AsObject(doc.Prepared)["placement"], "page", pages.Count), pages.Count);
            Text = (manual ? "Przesuń grafikę — " : "Sprawdź dokument — ") + Path.GetFileName(doc.Source);
            Font = new Font("Segoe UI", 10);
            StartPosition = FormStartPosition.CenterParent;
            ClientSize = new Size(980, 820); MinimumSize = new Size(760, 560);
            KeyPreview = true;
            TableLayoutPanel layout = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 5, Padding = new Padding(12) };
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            FlowLayoutPanel navigation = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill };
            previous.Text = "← Poprzednia"; next.Text = "Następna →";
            foreach (Button button in new Button[] { previous, next }) { button.AutoSize = true; button.MinimumSize = new Size(145, 40); }
            previous.Click += async delegate { await Navigate(requestedPage - 1, false); };
            next.Click += async delegate { await Navigate(requestedPage + 1, false); };
            navigation.Controls.Add(previous);
            navigation.Controls.Add(new Label { Text = "Strona", AutoSize = true, Padding = new Padding(8, 10, 0, 0) });
            page.Width = 55; page.Margin = new Padding(3, 7, 3, 3); page.AccessibleName = "Numer strony PDF, Enter przechodzi do strony";
            page.KeyDown += async delegate(object sender, KeyEventArgs e) {
                if (e.KeyCode != Keys.Enter) return;
                e.SuppressKeyPress = true;
                int number;
                if (!int.TryParse(page.Text, out number) || number < 1 || number > pages.Count)
                { note.Text = "Wpisz numer strony od 1 do " + pages.Count + "."; page.SelectAll(); return; }
                await Navigate(number, false);
            };
            page.Leave += delegate { UpdateNavigation(); };
            navigation.Controls.Add(page);
            navigation.Controls.Add(new Label { Text = "z " + pages.Count, AutoSize = true, Padding = new Padding(0, 10, 8, 0) });
            navigation.Controls.Add(next);
            navigation.Controls.Add(new Label { Text = "Przewijaj kółkiem • PgUp / PgDn: strony", AutoSize = true, Padding = new Padding(10, 10, 0, 0) });
            viewport.Dock = DockStyle.Fill; viewport.AutoScroll = true; viewport.TabStop = true;
            viewport.BackColor = Color.FromArgb(225, 228, 232); viewport.AccessibleName = "Przewijany podgląd PDF";
            picture.SizeMode = PictureBoxSizeMode.StretchImage; picture.BackColor = Color.White;
            picture.AccessibleName = manual ? "Strona PDF — przeciągnij grafikę lub kliknij jej nowe miejsce" : "Przygotowany PDF z finalną grafiką";
            picture.Paint += PaintPlacement;
            picture.MouseDown += delegate(object sender, MouseEventArgs e) {
                viewport.Focus();
                if (e.Button != MouseButtons.Left || !CanPlace()) return;
                RectangleF rect = StampArea();
                dragOffset = chosen && rect.Contains(e.Location) ? new PointF(e.X - rect.X, e.Y - rect.Y) : PointF.Empty;
                dragging = true; picture.Capture = true; MoveStamp(e.Location);
            };
            picture.MouseMove += delegate(object sender, MouseEventArgs e) { if (dragging) MoveStamp(e.Location); };
            picture.MouseUp += delegate { dragging = false; picture.Capture = false; };
            picture.MouseCaptureChanged += delegate { if (!picture.Capture) dragging = false; };
            viewport.Controls.Add(picture);
            viewport.Resize += delegate { SizePage(); };
            viewport.MouseWheel += ScrollPage;
            picture.MouseWheel += ScrollPage;
            position.AutoSize = true; position.Dock = DockStyle.Fill;
            position.Controls.Add(new Label { Text = "Grafika — lewy brzeg (%):", AutoSize = true, Padding = new Padding(0, 6, 0, 0) });
            position.Controls.Add(left);
            position.Controls.Add(new Label { Text = "od góry (%):", AutoSize = true, Padding = new Padding(0, 6, 0, 0) });
            position.Controls.Add(top);
            object relative = Json.AsObject(doc.Info)["stampRel"];
            left.Maximum = (decimal)(100 * (1 - Number(relative, "width")));
            top.Maximum = (decimal)(100 * (1 - Number(relative, "height")));
            foreach (NumericUpDown value in new NumericUpDown[] { left, top })
            {
                value.DecimalPlaces = 1; value.Width = 70;
                value.ValueChanged += delegate { if (!settingPosition && CanPlace()) { chosen = true; UpdatePlacement(); } };
            }
            left.AccessibleName = "Lewy brzeg grafiki w procentach"; top.AccessibleName = "Odległość grafiki od góry w procentach";
            position.Visible = manual;
            FlowLayoutPanel footer = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft };
            accept.Text = manual ? "Użyj tego miejsca" : "Dokument sprawdzony";
            accept.AutoSize = true; accept.MinimumSize = new Size(190, 40); accept.Enabled = false;
            accept.Click += delegate { if (!rendering && renderedPage == requestedPage && (!manual || SelectedPlacement != null)) { DialogResult = DialogResult.OK; Close(); } };
            Button back = new Button { Text = "Anuluj", AutoSize = true, Height = 40, DialogResult = DialogResult.Cancel };
            footer.Controls.Add(accept); footer.Controls.Add(back);
            if (!manual && doc.Graphic)
                footer.Controls.Add(new Button { Text = "Przesuń grafikę / wybierz stronę", AutoSize = true, Height = 40, DialogResult = DialogResult.Retry });
            retry.Text = "Ponów wczytanie"; retry.AutoSize = true; retry.Visible = false;
            retry.Click += async delegate { await Render(); };
            footer.Controls.Add(retry);
            note.AutoSize = true; note.Dock = DockStyle.Fill; note.Padding = new Padding(0, 6, 8, 6);
            note.MaximumSize = new Size(ClientSize.Width - 50, 0);
            SizeChanged += delegate { note.MaximumSize = new Size(Math.Max(200, ClientSize.Width - 50), 0); };
            layout.Controls.Add(navigation, 0, 0); layout.Controls.Add(viewport, 0, 1);
            layout.Controls.Add(position, 0, 2); layout.Controls.Add(note, 0, 3); layout.Controls.Add(footer, 0, 4); Controls.Add(layout);
            CancelButton = back;
            UpdateNavigation();
            Shown += async delegate { viewport.Focus(); await Render(); };
            FormClosing += delegate { closing = true; cancel.Cancel(); };
            FormClosed += delegate { ClearImage(); if (!rendering) cancel.Dispose(); };
        }

        internal static int ClampPage(int value, int count) { return Math.Max(1, Math.Min(count, value)); }
        private bool Placeable() { return Json.GetString(pages[requestedPage - 1], "placeable") == "True"; }
        private bool CanPlace() { return manual && !rendering && renderedPage == requestedPage && Placeable() && picture.Image != null; }
        private static double Number(object obj, string key) { return Convert.ToDouble(Json.AsObject(obj)[key]); }

        private void UpdateNavigation()
        {
            page.Text = requestedPage.ToString(); previous.Enabled = requestedPage > 1; next.Enabled = requestedPage < pages.Count;
        }

        private async Task Navigate(int number, bool bottom)
        {
            number = ClampPage(number, pages.Count);
            if (number == requestedPage) return;
            initialView = false; requestedPage = number; startAtBottom = bottom; UpdateNavigation();
            accept.Enabled = false; position.Enabled = false; SelectedPlacement = null;
            chosen = false; dragging = false; picture.Capture = false; ClearImage();
            note.Text = "Wczytywanie strony " + requestedPage + "…";
            if (!rendering) await Render();
        }

        protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
        {
            if (keyData == Keys.PageDown || keyData == Keys.PageUp || keyData == (Keys.Control | Keys.Home) || keyData == (Keys.Control | Keys.End) ||
                (!(ActiveControl is TextBoxBase) && !(ActiveControl is NumericUpDown) && (keyData == Keys.Right || keyData == Keys.Left)))
            {
                int target = keyData == (Keys.Control | Keys.Home) ? 1 : keyData == (Keys.Control | Keys.End) ? pages.Count :
                    requestedPage + (keyData == Keys.PageDown || keyData == Keys.Right ? 1 : -1);
                BeginInvoke(new Action(async delegate { if (!closing) await Navigate(target, false); }));
                return true;
            }
            return base.ProcessCmdKey(ref msg, keyData);
        }

        private async void ScrollPage(object sender, MouseEventArgs e)
        {
            HandledMouseEventArgs handled = e as HandledMouseEventArgs;
            if (handled != null) handled.Handled = true;
            if (rendering || picture.Image == null || e.Delta == 0) return;
            int offset = -viewport.AutoScrollPosition.Y;
            int maximum = Math.Max(0, picture.Height - viewport.ClientSize.Height);
            if (e.Delta < 0 && offset >= maximum) { await Navigate(requestedPage + 1, false); return; }
            if (e.Delta > 0 && offset <= 0) { await Navigate(requestedPage - 1, true); return; }
            int step = Math.Max(48, Math.Abs(e.Delta) / 120 * 80);
            viewport.AutoScrollPosition = new Point(0, Math.Max(0, Math.Min(maximum, offset + (e.Delta < 0 ? step : -step))));
        }

        private void ClearImage()
        {
            Image old = picture.Image; picture.Image = null; renderedPage = 0;
            if (old != null) old.Dispose();
        }

        private async Task Render()
        {
            if (rendering || closing) return;
            rendering = true; accept.Enabled = false; position.Enabled = false; retry.Visible = false;
            try
            {
                // One request at a time: this worker's pipe has no request IDs. Ignore outdated pages.
                while (!closing)
                {
                    int target = requestedPage;
                    note.Text = "Wczytywanie strony " + target + "…";
                    object request = manual ? (object)new { op = "render", pdf = Convert.ToBase64String(document.Original), page = target } : new { op = "render", page = target };
                    object result = await worker.Request(request, cancel.Token);
                    cancel.Token.ThrowIfCancellationRequested();
                    if (target != requestedPage) continue;
                    byte[] bytes = Convert.FromBase64String(Json.GetString(result, "png"));
                    using (MemoryStream stream = new MemoryStream(bytes))
                    using (Image image = Image.FromStream(stream))
                    {
                        ClearImage(); picture.Image = new Bitmap(image); renderedPage = target;
                    }
                    SizePage();
                    viewport.AutoScrollPosition = new Point(0, startAtBottom ? Math.Max(0, picture.Height - viewport.ClientSize.Height) : 0);
                    note.Text = manual ? (Placeable() ? "Przeciągnij grafikę lub kliknij jej nowe miejsce. Stronę wybierz u góry." :
                        "Ta strona jest obrócona lub kadrowana. Wybierz inną stronę albo wróć i wyłącz grafikę.") :
                        "Sprawdź dokument i grafikę. Podpis obejmie dokładnie tę przygotowaną wersję PDF.";
                    break;
                }
            }
            catch (OperationCanceledException) { }
            catch (Exception ex) { if (!closing) { ClearImage(); note.Text = "Nie wczytano strony: " + ex.Message; retry.Visible = true; } }
            finally
            {
                rendering = false;
                if (closing) { cancel.Dispose(); }
                else if (renderedPage == requestedPage && picture.Image != null)
                {
                    position.Enabled = manual && Placeable(); accept.Enabled = !manual;
                    if (manual && Placeable()) InitializePlacement();
                    if (initialView) { initialView = false; ScrollToInitialPlacement(); }
                }
            }
        }

        private void ScrollToInitialPlacement()
        {
            if (!document.Graphic || picture.Image == null) return;
            RectangleF graphic;
            if (manual)
            {
                if (!chosen || SelectedPlacement == null) return;
                graphic = StampArea();
            }
            else
            {
                object placement = Json.AsObject(document.Prepared)["placement"];
                if (Json.GetInt(placement, "page", 0) != renderedPage) return;
                object rect = Json.AsObject(placement)["rect"], size = pages[renderedPage - 1];
                float height = picture.Height * (float)(Number(rect, "height") / Number(size, "height"));
                float y = picture.Height * (float)(1 - (Number(rect, "y") + Number(rect, "height")) / Number(size, "height"));
                graphic = new RectangleF(0, y, 0, height);
            }
            int offset = Math.Max(0, Math.Min(Math.Max(0, picture.Height - viewport.ClientSize.Height),
                (int)(graphic.Top + graphic.Height / 2 - viewport.ClientSize.Height / 2)));
            viewport.AutoScrollPosition = new Point(0, offset);
        }
        private void SizePage()
        {
            if (picture.Image == null || viewport.ClientSize.Width <= 30) return;
            int width = Math.Max(1, viewport.ClientSize.Width - SystemInformation.VerticalScrollBarWidth - 2);
            picture.Size = new Size(width, Math.Max(1, (int)((double)picture.Image.Height * width / picture.Image.Width)));
        }

        private void InitializePlacement()
        {
            object saved = Json.AsObject(initialPlacement);
            object rect = saved != null && Json.GetInt(saved, "page", 0) == requestedPage ? Json.AsObject(saved)["rect"] : null;
            object size = pages[requestedPage - 1];
            settingPosition = true;
            left.Value = Math.Min(left.Maximum, Math.Max(0, rect == null ? left.Maximum - 4 : (decimal)(100 * Number(rect, "x") / Number(size, "width"))));
            top.Value = Math.Min(top.Maximum, Math.Max(0, rect == null ? top.Maximum - 10 : (decimal)(100 * (1 - (Number(rect, "y") + Number(rect, "height")) / Number(size, "height")))));
            settingPosition = false; chosen = true; UpdatePlacement();
        }

        private void MoveStamp(Point point)
        {
            if (!CanPlace()) return;
            settingPosition = true;
            left.Value = Math.Min(left.Maximum, Math.Max(0, (decimal)((point.X - dragOffset.X) * 100 / picture.ClientSize.Width)));
            top.Value = Math.Min(top.Maximum, Math.Max(0, (decimal)((point.Y - dragOffset.Y) * 100 / picture.ClientSize.Height)));
            settingPosition = false; chosen = true; UpdatePlacement();
        }

        private void UpdatePlacement()
        {
            if (!CanPlace() || !chosen) return;
            object size = pages[requestedPage - 1], relative = Json.AsObject(document.Info)["stampRel"];
            double width = Number(size, "width"), height = Number(size, "height");
            double stampWidth = width * Number(relative, "width"), stampHeight = height * Number(relative, "height");
            SelectedPlacement = new { page = renderedPage, rect = new {
                x = width * (double)left.Value / 100, y = height * (1 - (double)top.Value / 100) - stampHeight,
                width = stampWidth, height = stampHeight } };
            accept.Enabled = true; picture.Invalidate();
        }

        private RectangleF StampArea()
        {
            object relative = Json.AsObject(document.Info)["stampRel"];
            return new RectangleF(picture.Width * (float)left.Value / 100, picture.Height * (float)top.Value / 100,
                picture.Width * (float)Number(relative, "width"), picture.Height * (float)Number(relative, "height"));
        }

        private void PaintPlacement(object sender, PaintEventArgs e)
        {
            if (!CanPlace() || !chosen) return;
            RectangleF rect = StampArea();
            using (Brush brush = new SolidBrush(Color.FromArgb(55, 0, 110, 160))) e.Graphics.FillRectangle(brush, rect);
            using (Pen pen = new Pen(Color.FromArgb(0, 100, 150), 2)) e.Graphics.DrawRectangle(pen, rect.X, rect.Y, rect.Width, rect.Height);
        }
    }
}
