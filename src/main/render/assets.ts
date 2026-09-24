import { promises as fs } from 'fs'
import { join } from 'path'
import { ensureDir } from '../export/fsStructure'

// The offline archive viewer, authored fresh. `styles.css` + `app.js` are
// written once per export into <server>/assets/ and referenced by every page
// with a relative path so the archive is fully self-contained over file://.

export const VIEWER_CSS = String.raw`
:root,
[data-theme="dark"] {
  --bg: #313338; --bg-alt: #2b2d31; --bg-elev: #1e1f22; --panel: #383a40;
  --text: #dbdee1; --muted: #949ba4; --accent: #5865f2; --accent-2: #7289da;
  --border: #232428; --link: #00a8fc; --success: #23a55a; --warn: #f0b232; --error: #f23f43;
}
[data-theme="oled"] { --bg:#000; --bg-alt:#000; --bg-elev:#0a0a0a; --panel:#0d0d0d;
  --text:#e6e6e6; --muted:#7a7a7a; --accent:#5865f2; --border:#1a1a1a; --link:#3b9dff; }
[data-theme="mid"] { --bg:#1a1c2c; --bg-alt:#16172a; --bg-elev:#0f1020; --panel:#22253b;
  --text:#cdd3f0; --muted:#8089b3; --accent:#7c4dff; --border:#2a2d4a; --link:#64b5ff; }
[data-theme="nord"] { --bg:#2e3440; --bg-alt:#2b303b; --bg-elev:#242933; --panel:#3b4252;
  --text:#eceff4; --muted:#8b94a6; --accent:#88c0d0; --border:#434c5e; --link:#81a1c1; }
[data-theme="drac"] { --bg:#282a36; --bg-alt:#21222c; --bg-elev:#191a21; --panel:#343746;
  --text:#f8f8f2; --muted:#9aa0b3; --accent:#bd93f9; --border:#44475a; --link:#8be9fd; }
[data-theme="neo"] { --bg:#0d0221; --bg-alt:#0a0119; --bg-elev:#060010; --panel:#1a0b3d;
  --text:#e0d5ff; --muted:#9b7fd4; --accent:#ff2bd6; --accent-2:#7b2bff; --border:#3a1d6e; --link:#2bffea; }

* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text);
  font-family: "gg sans", "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.4; }
a { color: var(--link); text-decoration: none; }
a:hover { text-decoration: underline; }
.topbar { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: 14px;
  padding: 12px 20px; background: var(--bg-elev); border-bottom: 1px solid var(--border); }
.topbar h1 { font-size: 17px; margin: 0; font-weight: 600; }
.topbar .crumbs { color: var(--muted); font-size: 13px; }
.topbar .crumbs a { color: var(--muted); }
.spacer { flex: 1; }
.themes { display: flex; gap: 6px; }
.themes button { width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--border);
  cursor: pointer; padding: 0; }
.search { background: var(--bg-elev); border: 1px solid var(--border); border-radius: 6px;
  color: var(--text); padding: 7px 10px; width: 240px; outline: none; }
.wrap { max-width: 980px; margin: 0 auto; padding: 20px; }
.card { background: var(--bg-alt); border: 1px solid var(--border); border-radius: 10px;
  padding: 18px 20px; margin-bottom: 16px; }
.meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
.stat { background: var(--bg-elev); border-radius: 8px; padding: 12px 14px; }
.stat .n { font-size: 22px; font-weight: 700; }
.stat .l { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
.list-link { display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px; border-radius: 8px; background: var(--bg-elev); margin-bottom: 6px; }
.list-link:hover { background: var(--panel); }
.list-link .badge { color: var(--muted); font-size: 12px; }
.section-title { font-size: 13px; text-transform: uppercase; letter-spacing: .05em;
  color: var(--muted); margin: 20px 0 10px; }
.hash { color: var(--muted); }

/* Messages */
.msg { display: flex; gap: 14px; padding: 8px 4px; border-radius: 6px; }
.msg:hover { background: var(--bg-alt); }
.msg.hidden { display: none; }
.avatar { width: 40px; height: 40px; border-radius: 50%; flex: 0 0 40px; background: var(--panel);
  object-fit: cover; }
.msg-body { flex: 1; min-width: 0; }
.msg-head { display: flex; align-items: baseline; gap: 8px; }
.msg-author { font-weight: 600; color: var(--text); }
.msg-time { color: var(--muted); font-size: 12px; }
.msg-edited { color: var(--muted); font-size: 11px; }
.msg-content { white-space: pre-wrap; word-wrap: break-word; }
.msg-content code { background: var(--bg-elev); padding: 2px 5px; border-radius: 4px; font-size: 13px; }
.msg-content pre { background: var(--bg-elev); padding: 10px 12px; border-radius: 6px; overflow: auto; }
.reply { display: flex; gap: 6px; color: var(--muted); font-size: 13px; margin-bottom: 3px;
  align-items: center; }
.reply .ra { font-weight: 600; color: var(--text); }
.pin { color: var(--warn); font-size: 11px; margin-left: 6px; }
.att { margin-top: 6px; }
.att img, .att video { max-width: 420px; max-height: 360px; border-radius: 8px; display: block; cursor: pointer; }
.att a.file { display: inline-flex; align-items: center; gap: 8px; background: var(--bg-elev);
  border: 1px solid var(--border); border-radius: 8px; padding: 10px 14px; margin-top: 6px; }
.embed { border-left: 4px solid var(--accent); background: var(--bg-elev); border-radius: 6px;
  padding: 10px 14px; margin-top: 6px; max-width: 480px; }
.embed .et { font-weight: 600; margin-bottom: 4px; }
.embed img.ei { max-width: 100%; border-radius: 6px; margin-top: 8px; }
.sticker img { width: 140px; height: 140px; object-fit: contain; margin-top: 6px; }
.empty { color: var(--muted); text-align: center; padding: 40px; }
.lightbox { position: fixed; inset: 0; background: rgba(0,0,0,.85); display: none;
  align-items: center; justify-content: center; z-index: 50; }
.lightbox.open { display: flex; }
.lightbox img { max-width: 92vw; max-height: 92vh; border-radius: 8px; }
.count-note { color: var(--muted); font-size: 12px; padding: 6px 4px; }
`

export const VIEWER_JS = String.raw`
(function () {
  var THEMES = ['dark','oled','mid','nord','drac','neo'];
  var COLORS = { dark:'#5865f2', oled:'#000', mid:'#7c4dff', nord:'#88c0d0', drac:'#bd93f9', neo:'#ff2bd6' };

  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('db-theme', t); } catch (e) {}
  }
  function initTheme() {
    var saved = 'dark';
    try { saved = localStorage.getItem('db-theme') || 'dark'; } catch (e) {}
    applyTheme(saved);
    var bar = document.querySelector('.themes');
    if (bar) {
      THEMES.forEach(function (t) {
        var b = document.createElement('button');
        b.title = t; b.style.background = COLORS[t];
        b.onclick = function () { applyTheme(t); };
        bar.appendChild(b);
      });
    }
  }

  // Quotes must be escaped too: renderContent() puts matched URLs inside href="...".
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Light markdown: code blocks, inline code, bold, italic, links, mentions kept literal.
  function renderContent(text) {
    if (!text) return '';
    var html = esc(text);
    var BT = String.fromCharCode(96);
    html = html.replace(new RegExp(BT + BT + BT + '([\\s\\S]*?)' + BT + BT + BT, 'g'), function (_m, c) { return '<pre>' + c + '</pre>'; });
    html = html.replace(new RegExp(BT + '([^' + BT + ']+)' + BT, 'g'), '<code>$1</code>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noreferrer">$1</a>');
    return html;
  }

  function fmtTime(iso) {
    try { var d = new Date(iso); return d.toLocaleString(); } catch (e) { return iso; }
  }

  function isImage(p) { return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(p || ''); }
  function isVideo(p) { return /\.(mp4|webm|mov|mkv)$/i.test(p || ''); }

  function attachmentEl(a) {
    var path = a.localPath || a.url;
    var wrap = document.createElement('div'); wrap.className = 'att';
    if (a.localPath && isImage(a.localPath)) {
      var img = document.createElement('img'); img.src = a.localPath; img.loading = 'lazy';
      img.onclick = function () { openLightbox(a.localPath); };
      wrap.appendChild(img);
    } else if (a.localPath && isVideo(a.localPath)) {
      var v = document.createElement('video'); v.src = a.localPath; v.controls = true; wrap.appendChild(v);
    } else {
      var link = document.createElement('a'); link.className = 'file'; link.href = path;
      link.target = '_blank'; link.textContent = '📎 ' + (a.filename || 'attachment');
      wrap.appendChild(link);
    }
    return wrap;
  }

  function embedEl(e) {
    var box = document.createElement('div'); box.className = 'embed';
    if (e.author && e.author.name) { var au = document.createElement('div'); au.className = 'et'; au.textContent = e.author.name; box.appendChild(au); }
    if (e.title) {
      var t = document.createElement('div'); t.className = 'et';
      if (e.url && /^https?:\/\//i.test(e.url)) {
        var ta = document.createElement('a'); ta.href = e.url; ta.target = '_blank'; ta.rel = 'noreferrer';
        ta.textContent = e.title; t.appendChild(ta);
      } else { t.textContent = e.title; }
      box.appendChild(t);
    }
    if (e.description) { var d = document.createElement('div'); d.innerHTML = renderContent(e.description); box.appendChild(d); }
    if (e.fields) { e.fields.forEach(function (f) { var fd = document.createElement('div'); fd.innerHTML = '<strong>' + esc(f.name) + '</strong><br>' + renderContent(f.value); box.appendChild(fd); }); }
    var img = (e.image && e.image.localPath) || (e.thumbnail && e.thumbnail.localPath);
    if (img) { var im = document.createElement('img'); im.className = 'ei'; im.src = img; im.loading = 'lazy'; im.onclick = function () { openLightbox(img); }; box.appendChild(im); }
    if (e.footer && e.footer.text) { var ft = document.createElement('div'); ft.style.color = 'var(--muted)'; ft.style.fontSize = '12px'; ft.style.marginTop = '6px'; ft.textContent = e.footer.text; box.appendChild(ft); }
    return box;
  }

  function messageEl(m) {
    var row = document.createElement('div'); row.className = 'msg';
    row.dataset.search = ((m.author && m.author.username) + ' ' + (m.content || '')).toLowerCase();

    var av = document.createElement('img'); av.className = 'avatar'; av.loading = 'lazy';
    av.src = (m.author && m.author.avatar) || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" rx="20" fill="%23383a40"/></svg>';
    row.appendChild(av);

    var body = document.createElement('div'); body.className = 'msg-body';

    if (m.replyTo) {
      var rep = document.createElement('div'); rep.className = 'reply';
      rep.innerHTML = '↳ <span class="ra">' + esc(m.replyTo.author) + '</span> ' + esc(m.replyTo.contentPreview || '');
      body.appendChild(rep);
    }

    var head = document.createElement('div'); head.className = 'msg-head';
    head.innerHTML = '<span class="msg-author">' + esc(m.author ? m.author.username : 'Unknown') +
      '</span><span class="msg-time">' + esc(fmtTime(m.timestamp)) + '</span>' +
      (m.editedTimestamp ? '<span class="msg-edited">(edited)</span>' : '') +
      (m.pinned ? '<span class="pin">📌 pinned</span>' : '');
    body.appendChild(head);

    if (m.content) { var c = document.createElement('div'); c.className = 'msg-content'; c.innerHTML = renderContent(m.content); body.appendChild(c); }
    (m.attachments || []).forEach(function (a) { body.appendChild(attachmentEl(a)); });
    (m.embeds || []).forEach(function (e) { body.appendChild(embedEl(e)); });
    (m.stickers || []).forEach(function (s) {
      var sd = document.createElement('div'); sd.className = 'sticker';
      if (s.localPath && /\.(png|gif)$/i.test(s.localPath)) { var si = document.createElement('img'); si.src = s.localPath; sd.appendChild(si); }
      else { sd.textContent = '🏷️ Sticker: ' + (s.name || ''); }
      body.appendChild(sd);
    });

    row.appendChild(body);
    return row;
  }

  var lb;
  function openLightbox(src) { if (!lb) return; lb.querySelector('img').src = src; lb.classList.add('open'); }

  function renderChannel(data) {
    var feed = document.getElementById('feed');
    if (!feed) return;
    var msgs = data.messages || [];
    if (msgs.length === 0) { feed.innerHTML = '<div class="empty">No messages exported.</div>'; return; }
    var BATCH = 200, i = 0;
    function chunk() {
      var frag = document.createDocumentFragment();
      var end = Math.min(i + BATCH, msgs.length);
      for (; i < end; i++) frag.appendChild(messageEl(msgs[i]));
      feed.appendChild(frag);
      if (i < msgs.length) requestAnimationFrame(chunk);
    }
    chunk();

    var search = document.getElementById('search');
    if (search) {
      search.addEventListener('input', function () {
        var q = search.value.toLowerCase().trim();
        var rows = feed.querySelectorAll('.msg');
        var shown = 0;
        rows.forEach(function (r) {
          var ok = !q || (r.dataset.search || '').indexOf(q) !== -1;
          r.classList.toggle('hidden', !ok);
          if (ok) shown++;
        });
        var note = document.getElementById('countNote');
        if (note) note.textContent = q ? (shown + ' matching messages') : '';
      });
    }
  }

  function filterServerLists() {
    var search = document.getElementById('search');
    if (!search) return;
    search.addEventListener('input', function () {
      var q = search.value.toLowerCase().trim();
      document.querySelectorAll('[data-name]').forEach(function (el) {
        var ok = !q || el.getAttribute('data-name').toLowerCase().indexOf(q) !== -1;
        el.style.display = ok ? '' : 'none';
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initTheme();
    lb = document.querySelector('.lightbox');
    if (lb) lb.addEventListener('click', function () { lb.classList.remove('open'); });
    if (window.__CHANNEL_DATA__) renderChannel(window.__CHANNEL_DATA__);
    if (window.__SERVER_DATA__) filterServerLists();
  });
})();
`

/** Write the shared viewer assets into <serverRoot>/assets/. */
export async function writeAssets(serverRoot: string): Promise<void> {
  const dir = join(serverRoot, 'assets')
  await ensureDir(dir)
  await fs.writeFile(join(dir, 'styles.css'), VIEWER_CSS, 'utf8')
  await fs.writeFile(join(dir, 'app.js'), VIEWER_JS, 'utf8')
}
