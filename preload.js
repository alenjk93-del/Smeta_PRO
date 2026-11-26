'use strict';
/* Настольный мост для SmetaPRO (ПК): определяет window.AndroidBridge
   до загрузки скриптов страницы, поэтому веб-код приложения работает
   без изменений. folder* методы НЕ определяются — «Папка смет» (SAF)
   на ПК отключается сама, остаются обычные сохранения. generatePdf /
   sharePdf (с 1.11.29) создают настоящий PDF-файл через main.js
   (printToPDF по мобильному макету buildPdf). */
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

/* 1.11.29: плашка версии — закреплена в правом нижнем углу главного
   экрана (стили .pc-ver-fixed в pc-wide.css, видна только когда
   показан #scr-home). Используется сам узел #upd-ver из appbar:
   перемещается, не клонируется — обработчик проверки обновлений
   приложения сохраняется. */
try {
  const moveVerBtn = () => {
    const updBtn = document.getElementById('upd-ver');
    if (!updBtn || updBtn.dataset.pcMoved) return;
    updBtn.dataset.pcMoved = '1';
    updBtn.classList.add('pc-ver-fixed');
    document.body.appendChild(updBtn);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', moveVerBtn);
  else moveVerBtn();
} catch (e) {}

function callPage(fn, arg) {
  try { if (typeof window[fn] === 'function') window[fn](arg); } catch (e) {}
}

/* 1.11.29: закреплённые кнопки «Назад» и «Главная» в левом верхнем
   углу — всегда на виду при прокрутке (стили — .pc-navbtns в
   pc-wide.css). «Назад» — готовая логика приложения __smetaBack
   (как системная кнопка на телефоне), «Главная» — navHome. */
try {
  const injectNavBtns = () => {
    if (document.getElementById('pc-navbtns')) return;
    const box = document.createElement('div');
    box.id = 'pc-navbtns';
    box.className = 'pc-navbtns';
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'pc-navbtn';
    back.title = 'Назад';
    back.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true"><path d="M15 5l-7 7 7 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    back.onclick = () => callPage('__smetaBack');
    const homeBtn = document.createElement('button');
    homeBtn.type = 'button';
    homeBtn.className = 'pc-navbtn';
    homeBtn.title = 'Главная';
    homeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true"><path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
    homeBtn.onclick = () => callPage('navHome');
    box.appendChild(back);
    box.appendChild(homeBtn);
    document.body.appendChild(box);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectNavBtns);
  else injectNavBtns();
} catch (e) {}

window.AndroidBridge = {
  /* --- обновления с GitHub Releases (ассеты SmetaPRO-PC-Setup-*.exe) --- */
  updVersion: function () {
    return JSON.stringify({ name: pkg.version, code: 92 });
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

  /* --- печать, PDF и Excel --- */
  printPdf: function (json) { setTimeout(() => { try { window.print(); } catch (e) {} }, 80); },
  generatePdf: function (json) { ipcRenderer.send('save-pdf', json); },
  sharePdf: function (json) { ipcRenderer.send('save-pdf', json); },
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
