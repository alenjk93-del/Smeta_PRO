'use strict';
/* SmetaPRO для ПК — оболочка Electron вокруг того же веб-приложения,
   что работает на телефоне (app/index.html + app/db.js, без изменений).
   Данные (localStorage smeta_pro_v1) живут в профиле пользователя
   Windows и переживают переустановки и обновления программы. */
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { buildXlsxBuffer } = require('./xlsx-export');

const RELEASES_API = 'https://api.github.com/repos/alenjk93-del/Smeta_PRO/releases?per_page=30';
const ASSET_RE = /^SmetaPRO-PC-Setup-v(\d+)\.(\d+)\.(\d+)\.exe$/i;
const FILE_RE = /\.(smetabook|smetaest|smetatpl)$/i;

let mainWindow = null;
let pendingText = '';
let downloadedSetup = null;
let downloadedVersion = '';

function fileFromArgv(argv) {
  return (argv || []).find(a => typeof a === 'string' && FILE_RE.test(a));
}
function loadPending(argv) {
  const f = fileFromArgv(argv);
  if (!f) return false;
  try { pendingText = fs.readFileSync(f, 'utf8'); return true; } catch (e) { return false; }
}
loadPending(process.argv);

function deliverPending() {
  if (!pendingText || !mainWindow) return;
  const txt = pendingText; pendingText = '';
  const js = 'if (window.__sharedFileOpened) window.__sharedFileOpened(' + JSON.stringify(txt) +
    '); else if (window.__bookFileOpened) window.__bookFileOpened(' + JSON.stringify(txt) + ');';
  mainWindow.webContents.executeJavaScript(js).catch(() => {});
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180, height: 840, minWidth: 360, minHeight: 520,
    title: 'Смета PRO',
    icon: path.join(__dirname, 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: false,
      sandbox: false,
      nodeIntegration: false
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'app', 'index.html'));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  if (process.env.SMETA_PC_TEST_OUT) {
    mainWindow.webContents.on('did-finish-load', () => {
      setTimeout(async () => {
        const out = {};
        try {
          out.bridge = await mainWindow.webContents.executeJavaScript('typeof window.AndroidBridge');
          out.updVersion = await mainWindow.webContents.executeJavaScript('AndroidBridge.updVersion()');
          out.hasFolderBridge = await mainWindow.webContents.executeJavaScript('!!(window.AndroidBridge && AndroidBridge.folderStatus)');
          out.bodyText = (await mainWindow.webContents.executeJavaScript('document.body.innerText.slice(0, 200)')) || '';
          await mainWindow.webContents.executeJavaScript('localStorage.setItem("__pc_test", "1")');
          out.localStorage = await mainWindow.webContents.executeJavaScript('localStorage.getItem("__pc_test")');
        } catch (e) { out.error = String(e && e.message || e); }
        try { fs.writeFileSync(process.env.SMETA_PC_TEST_OUT, JSON.stringify(out, null, 2)); } catch (e) {}
        app.quit();
      }, 2500);
    });
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }
else {
  app.on('second-instance', (e, argv) => {
    const had = loadPending(argv);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      if (had) deliverPending();
    }
  });
  app.whenReady().then(createWindow);
  app.on('window-all-closed', () => app.quit());
}

/* ---------------- IPC ---------------- */

ipcMain.on('get-pending', (e) => {
  e.returnValue = pendingText || '';
  pendingText = '';
});

async function saveWithDialog(name, data) {
  if (!mainWindow) return;
  try {
    const res = await dialog.showSaveDialog(mainWindow, { defaultPath: name });
    if (res.canceled || !res.filePath) return;
    fs.writeFileSync(res.filePath, data);
  } catch (e) {}
}
ipcMain.on('save-text', (e, name, text) => { saveWithDialog(String(name || 'file.txt'), String(text)); });
ipcMain.on('save-xlsx', (e, json) => {
  try {
    const pay = JSON.parse(json);
    saveWithDialog((pay.fileBase || 'Smeta') + '.xlsx', buildXlsxBuffer(json));
  } catch (err) {}
});

ipcMain.handle('fetch-url', async (e, url) => {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 40000);
    const r = await fetch(url, {
      signal: ctrl.signal, redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36' }
    });
    clearTimeout(t);
    if (!r.ok) return null;
    return await r.text();
  } catch (err) { return null; }
});

function cmpVer(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d; }
  return 0;
}

ipcMain.handle('upd-check', async () => {
  try {
    const r = await fetch(RELEASES_API, { headers: { 'User-Agent': 'SmetaPRO-PC', 'Accept': 'application/vnd.github+json' } });
    if (!r.ok) return { ok: false, error: 'Не удалось проверить обновления.' };
    const rels = await r.json();
    let best = null;
    for (const rel of rels) {
      if (rel.draft) continue;
      for (const a of (rel.assets || [])) {
        const m = ASSET_RE.exec(a.name || '');
        if (!m) continue;
        const v = m[1] + '.' + m[2] + '.' + m[3];
        if (!best || cmpVer(v, best.version) > 0) best = { version: v, href: a.browser_download_url, size: a.size || 0 };
      }
    }
    if (!best) return { ok: true, version: app.getVersion() };
    return { ok: true, version: best.version, href: best.href, size: best.size };
  } catch (e) { return { ok: false, error: 'Не удалось проверить обновления.' }; }
});

function downloadFollow(url, dest, wc, start, hops) {
  if (hops > 6) { wc.send('upd-download-done', { ok: false, error: 'Не удалось скачать обновление.' }); return; }
  https.get(url, { headers: { 'User-Agent': 'SmetaPRO-PC' } }, (res) => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      res.resume();
      downloadFollow(res.headers.location, dest, wc, start, hops + 1);
      return;
    }
    if (res.statusCode !== 200) { wc.send('upd-download-done', { ok: false, error: 'Не удалось скачать обновление.' }); return; }
    const total = parseInt(res.headers['content-length'] || '0', 10);
    let done = 0, lastSent = 0;
    const file = fs.createWriteStream(dest);
    res.on('data', (chunk) => {
      done += chunk.length;
      const now = Date.now();
      if (now - lastSent > 200) {
        lastSent = now;
        const secs = Math.max((now - start) / 1000, 0.1);
        wc.send('upd-progress', { done, total, kbps: Math.round(done / 1024 / secs) });
      }
    });
    res.pipe(file);
    file.on('finish', () => {
      file.close(() => {
        downloadedSetup = dest;
        wc.send('upd-progress', { done, total: total || done, kbps: 0 });
        wc.send('upd-download-done', { ok: true, versionName: downloadedVersion });
      });
    });
    file.on('error', () => wc.send('upd-download-done', { ok: false, error: 'Не удалось скачать обновление.' }));
  }).on('error', () => wc.send('upd-download-done', { ok: false, error: 'Не удалось скачать обновление.' }));
}

ipcMain.on('upd-download', (e, href) => {
  const m = ASSET_RE.exec(decodeURIComponent(String(href || '')).split('/').pop() || '');
  downloadedVersion = m ? (m[1] + '.' + m[2] + '.' + m[3]) : '';
  const dest = path.join(app.getPath('temp'), 'SmetaPRO-PC-Setup-' + (downloadedVersion || 'new') + '.exe');
  downloadFollow(String(href), dest, e.sender, Date.now(), 0);
});

ipcMain.on('upd-install', () => {
  if (downloadedSetup && fs.existsSync(downloadedSetup)) {
    // Тихое обновление: установщик с флагом /UPDATE сам заменит файлы
    // в существующей папке и перезапустит программу. Если spawn не
    // удался — запасной путь: обычный мастер установки.
    try {
      const child = require('child_process').spawn(downloadedSetup, ['/UPDATE'], { detached: true, stdio: 'ignore' });
      child.unref();
    } catch (e) {
      shell.openPath(downloadedSetup);
    }
    setTimeout(() => app.quit(), 800);
  }
});
