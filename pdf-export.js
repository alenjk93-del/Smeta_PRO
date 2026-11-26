'use strict';
/* Печатный HTML для PDF-экспорта — повторяет мобильный Java buildPdf
   (MainActivity.java): A4, поля 42pt, заголовок жирный 16, мета 10,
   таблица №/Наименование/Ед./Цена, ₽/Объём/Сумма, ₽ с тёмной шапкой
   #17291C, группы разделов на #EDF5ED, «Итого по разделу» жирным 11.5
   без заливки, ИТОГО на #EDF5ED, после таблицы — сводка/наценка/
   транспорт и подписи. Рендерится в PDF через Electron printToPDF
   (см. main.js, обработчик 'save-pdf').
   Отличие от мобильного: подвал «Стр. N из M» — printToPDF не умеет
   нумерацию страниц, поэтому подвал не печатается. */
const { pdfNum, numStr } = require('./xlsx-export');

function num(v) { const n = Number(v); return isFinite(n) ? n : 0; }
function str(v, def) { return (v === undefined || v === null) ? (def || '') : String(v); }
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildPdfHtml(p) {
  // hideTotals: экспорт прайса — без итогов и подписей
  const hideTotals = !!p.hideTotals;
  const CW = [30.66, 214.62, 40.88, 71.54, 61.32, 91.98];
  const headers = ['№', 'Наименование', 'Ед.', 'Цена, ₽', 'Объём', 'Сумма, ₽'];
  const aligns = ['center', 'left', 'center', 'right', 'right', 'right'];

  const title = str(p.title, 'Смета');
  const metaLines = [];
  if (str(p.object) !== '') metaLines.push('Объект: ' + str(p.object));
  if (str(p.client) !== '') metaLines.push('Заказчик: ' + str(p.client));
  if (str(p.dateStr) !== '') metaLines.push('Дата: ' + str(p.dateStr));
  if (str(p.executor) !== '') metaLines.push('Исполнитель: ' + str(p.executor));

  const secs = Array.isArray(p.sections) ? p.sections : [];
  const multi = secs.length > 1;

  // Trailing lines after the table (как в Java)
  const trail = [];
  if (!!p.withSummary && secs.length > 1) {
    trail.push('Сводка по разделам');
    secs.forEach(sec => trail.push(str(sec.title) + ' — ' + pdfNum(num(sec.total)) + ' ₽'));
  }
  if (num(p.markupSum) !== 0) trail.push('Наценка (' + pdfNum(num(p.markupPct)) + '%): ' + pdfNum(num(p.markupSum)) + ' ₽');
  if (num(p.transport) !== 0) trail.push('Транспорт: ' + pdfNum(num(p.transport)) + ' ₽');
  const grandStr = pdfNum(num(p.grandTotal));

  let rows = '';
  let globalIdx = 0;
  secs.forEach(sec => {
    if (multi) {
      rows += '<tr class="group"><td colspan="6">' + esc(str(sec.title, 'Раздел')) + '</td></tr>';
    }
    (Array.isArray(sec.items) ? sec.items : []).forEach(it => {
      globalIdx++;
      const q = num(it.q), k = (it.k === undefined || it.k === null) ? 1 : num(it.k);
      const qty = (k === 1 || k === 0) ? pdfNum(q) : pdfNum(q) + ' × ' + pdfNum(k);
      const cells = [String(globalIdx), str(it.n), str(it.u), pdfNum(num(it.p)), qty, pdfNum(num(it.sum))];
      rows += '<tr>' + cells.map((c, i) =>
        '<td style="text-align:' + aligns[i] + '">' + esc(c) + '</td>').join('') + '</tr>';
    });
    if (multi && !hideTotals) {
      const tc = ['', 'Итого по разделу', '', '', '', pdfNum(num(sec.total))];
      rows += '<tr class="sectot">' + tc.map((c, i) =>
        '<td style="text-align:' + aligns[i] + '">' + esc(c) + '</td>').join('') + '</tr>';
    }
  });
  if (!hideTotals) {
    const tc = ['', 'ИТОГО', '', '', '', grandStr];
    rows += '<tr class="grand">' + tc.map((c, i) =>
      '<td style="text-align:' + aligns[i] + '">' + esc(c) + '</td>').join('') + '</tr>';
  }

  const headRow = '<tr>' + headers.map((h, i) =>
    '<th style="text-align:' + aligns[i] + '">' + esc(h) + '</th>').join('') + '</tr>';
  const cols = CW.map(w => '<col style="width:' + w + 'pt">').join('');

  const trailHtml = trail.map(t => '<div class="trail">' + esc(t) + '</div>').join('');
  const signHtml = hideTotals ? '' :
    '<div class="sign"><span>Исполнитель: ____________________</span>' +
    '<span class="sign2">Заказчик: ____________________</span></div>';

  return '<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><style>' +
    '@page{size:A4}' +
    'body{font-family:"Segoe UI",Arial,sans-serif;color:#1A211C;margin:0}' +
    '.title{font-size:16pt;font-weight:700;line-height:20pt;margin-bottom:8pt}' +
    '.meta{font-size:10pt;color:#404A42;line-height:14pt}' +
    'table{width:511pt;border-collapse:collapse;table-layout:fixed;margin-top:6pt}' +
    'th{background:#17291C;color:#FFFFFF;font-size:9.5pt;font-weight:700;height:18pt;padding:0 5pt;vertical-align:middle}' +
    'td{font-size:9.5pt;line-height:12pt;padding:3pt 5pt;border-bottom:0.5pt solid #CCD9CC;vertical-align:top;word-wrap:break-word}' +
    'td+td,th+th{border-left:0.5pt solid #CCD9CC}' +
    'th{border-left:none}' +
    'tr{page-break-inside:avoid}' +
    'thead{display:table-header-group}' +
    'tr.group td{background:#EDF5ED;font-weight:700;height:17pt;vertical-align:middle;padding-top:0;padding-bottom:0}' +
    'tr.sectot td{font-size:11.5pt;font-weight:700;height:20pt;vertical-align:middle;padding-top:0;padding-bottom:0}' +
    'tr.grand td{background:#EDF5ED;font-weight:700;height:18pt;vertical-align:middle;padding-top:0;padding-bottom:0}' +
    '.trail{font-size:10pt;color:#404A42;line-height:14pt}' +
    '.sign{position:relative;height:14pt;margin-top:24pt;font-size:10pt;color:#404A42}' +
    '.sign2{position:absolute;left:280pt;top:0}' +
    '</style></head><body>' +
    '<div class="title">' + esc(title) + '</div>' +
    metaLines.map(m => '<div class="meta">' + esc(m) + '</div>').join('') +
    '<table><colgroup>' + cols + '</colgroup><thead>' + headRow + '</thead><tbody>' + rows + '</tbody></table>' +
    trailHtml + signHtml +
    '</body></html>';
}

module.exports = { buildPdfHtml };
