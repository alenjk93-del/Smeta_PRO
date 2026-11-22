'use strict';
/* Настольный мост для SmetaPRO (ПК): определяет window.AndroidBridge
   до загрузки скриптов страницы, поэтому веб-код приложения работает
   без изменений. folder* методы НЕ определяются — «Папка смет» (SAF)
   на ПК отключается сама, остаются обычные сохранения. sharePdf /
   generatePdf НЕ определяются — срабатывает запасной window.print(). */
const { ipcRenderer, clipboard } = require('electron');
const pkg = require('./package.json');

/* Широкий интерфейс ПК (вариант А — боковое меню): стили pc-wide.css
   действуют только при ширине окна от 1000px; телефонная вёрстка
   приложения не меняется. */
try {
  const css = require('fs').readFileSync(require('path').join(__dirname, 'pc-wide.css'), 'utf8');
  const injectCss = () => {
    const s = document.createElement('style');
    s.id = 'pc-wide';
    s.textContent = css;
    document.head.appendChild(s);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectCss);
  else injectCss();
} catch (e) {}

/* Главный экран: разнести кнопки и список смет по двум контейнерам
   (.pc-nav / .pc-content), чтобы CSS мог держать их независимыми
   колонками. Узлы ПЕРЕМЕЩАЮТСЯ, а не клонируются: id и обработчики
   приложения сохраняются. Вне широкого окна контейнеры — обычные
   блоки, вид не меняется. */
try {
  const wrapHome = () => {
    const home = document.getElementById('scr-home');
    if (!home || home.dataset.pcWide) return;
    home.dataset.pcWide = '1';
    const nav = document.createElement('aside');
    nav.className = 'pc-nav';
    const content = document.createElement('div');
    content.className = 'pc-content';
    const h3 = home.querySelector('h3');
    const estList = document.getElementById('est-list');
    const news = document.getElementById('news-block');
    Array.from(home.childNodes).forEach(n => {
      if (n !== h3 && n !== estList && n !== news) nav.appendChild(n);
    });
    if (h3) content.appendChild(h3);
    if (estList) content.appendChild(estList);
    if (news) content.appendChild(news);
    home.appendChild(nav);
    home.appendChild(content);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wrapHome);
  else wrapHome();
} catch (e) {}

function callPage(fn, arg) {
  try { if (typeof window[fn] === 'function') window[fn](arg); } catch (e) {}
}

window.AndroidBridge = {
  /* --- обновления с GitHub Releases (ассеты SmetaPRO-PC-Setup-*.exe) --- */
  updVersion: function () {
    return JSON.stringify({ name: pkg.version, code: 89 });
  },
  updCheck: function () {
    ipcRenderer.invoke('upd-check')
      .then(res => callPage('__updCheckResult', res))
      .catch(() => callPage('__updCheckResult', { ok: false, error: 'Не удалось проверить обновления.' }));
  },
  updDownload: function (href) { ipcRenderer.send('upd-download', href); },
  updInstall: function () { ipcRenderer.send('upd-install'); },

  /* --- загрузка страниц для обновления каталога (без CORS) --- */
  fetchUrl: function (url, id) {
    ipcRenderer.invoke('fetch-url', url)
      .then(html => { try { if (typeof window[id] === 'function') window[id](html); } catch (e) {} })
      .catch(() => { try { if (typeof window[id] === 'function') window[id](null); } catch (e) {} });
  },

  /* --- файлы: на ПК «поделиться» = сохранить файл --- */
  saveFile: function (name, content, mime) { ipcRenderer.send('save-text', name, String(content)); },
  saveTextFile: function (name, text) { ipcRenderer.send('save-text', name, String(text)); },
  shareTextFile: function (name, text, mime) { ipcRenderer.send('save-text', name, String(text)); },
  shareText: function (text) { try { clipboard.writeText(String(text)); } catch (e) {} },

  /* --- печать и Excel --- */
  printPdf: function (json) { setTimeout(() => { try { window.print(); } catch (e) {} }, 80); },
  generateXlsx: function (json) { ipcRenderer.send('save-xlsx', json); },
  shareXlsx: function (json) { ipcRenderer.send('save-xlsx', json); },

  /* --- файл, открытый двойным щелчком (.smetabook/.smetaest/.smetatpl) --- */
  getPendingShared: function () { try { return ipcRenderer.sendSync('get-pending') || ''; } catch (e) { return ''; } },
  getPendingBook: function () { try { return ipcRenderer.sendSync('get-pending') || ''; } catch (e) { return ''; } }
};

ipcRenderer.on('upd-progress', (e, p) => {
  try { if (window.__updProgress) window.__updProgress(p.done, p.total, p.kbps); } catch (err) {}
});
ipcRenderer.on('upd-download-done', (e, res) => callPage('__updDownloadDone', res));
