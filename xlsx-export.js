'use strict';
/* Генерация XLSX из payload SmetaPRO (exportPayload / plPayload).
   Один формат на оба случая: у прайса hideTotals=true — без итогов и
   без колонок количества/коэффициента. Возвращает Buffer .xlsx. */
const XLSX = require('xlsx');

function num(v) { const n = Number(v); return isFinite(n) ? n : 0; }

function buildXlsxBuffer(json) {
  const pay = JSON.parse(json);
  const hideTotals = !!pay.hideTotals;
  const rows = [];
  rows.push([pay.title || 'Смета']);
  if (pay.object) rows.push(['Объект:', pay.object]);
  if (pay.client) rows.push(['Заказчик:', pay.client]);
  if (pay.dateStr) rows.push(['Дата:', pay.dateStr]);
  if (pay.executor) rows.push(['Исполнитель:', pay.executor]);
  rows.push([]);
  (pay.sections || []).forEach(sec => {
    rows.push([sec.title || 'Раздел']);
    if (hideTotals) rows.push(['№', 'Наименование', 'Ед. изм.', 'Цена, ₽']);
    else rows.push(['№', 'Наименование', 'Ед. изм.', 'Кол-во', 'Цена, ₽', 'Коэф.', 'Сумма, ₽']);
    (sec.items || []).forEach((it, i) => {
      if (hideTotals) rows.push([i + 1, it.n || '', it.u || '', num(it.p)]);
      else rows.push([i + 1, it.n || '', it.u || '', num(it.q), num(it.p), num(it.k == null ? 1 : it.k), num(it.sum)]);
    });
    if (!hideTotals) rows.push(['', 'Итого по разделу', '', '', '', '', num(sec.total)]);
    rows.push([]);
  });
  if (!hideTotals) {
    rows.push(['Итого по смете', '', '', '', '', '', num(pay.subtotal)]);
    if (pay.withSummary && num(pay.markupSum)) rows.push(['Наценка ' + num(pay.markupPct) + ' %', '', '', '', '', '', num(pay.markupSum)]);
    if (pay.withSummary && num(pay.transport)) rows.push(['Транспорт', '', '', '', '', '', num(pay.transport)]);
    rows.push(['ВСЕГО', '', '', '', '', '', num(pay.grandTotal)]);
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = hideTotals
    ? [{ wch: 5 }, { wch: 60 }, { wch: 10 }, { wch: 14 }]
    : [{ wch: 5 }, { wch: 60 }, { wch: 10 }, { wch: 10 }, { wch: 13 }, { wch: 8 }, { wch: 15 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Смета');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { buildXlsxBuffer };
