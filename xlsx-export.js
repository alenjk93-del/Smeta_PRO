'use strict';
/* Генерация XLSX из payload SmetaPRO (exportPayload / plPayload) —
   точный порт мобильного Java buildXlsx (MainActivity.java):
   стили (7 шрифтов, 5 заливок, 8 cellXfs), формулы с кэшированными
   значениями (сумма строки D*E*F, итог раздела SUM, сводка/ИТОГО —
   ссылки), rich-text мета-строки, «Сумма прописью», подписи.
   OOXML пишется вручную, zip — на Node zlib (deflateRaw + CRC32),
   без внешних зависимостей. Возвращает Buffer .xlsx. */
const zlib = require('zlib');

/* ---------- zip writer (store/deflate, без внешних библиотек) ---------- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function zipStore(entries) {
  // entries: [{name, data:Buffer}] — deflate, как ZipOutputStream в Java
  const chunks = [];
  const central = [];
  let offset = 0;
  const DOS_TIME = 0, DOS_DATE = 0x21; // 1980-01-01
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8');
    const crc = crc32(e.data);
    const comp = zlib.deflateRawSync(e.data, { level: 6 });
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);           // version needed
    lh.writeUInt16LE(0x0800, 6);       // UTF-8 flag
    lh.writeUInt16LE(8, 8);            // deflate
    lh.writeUInt16LE(DOS_TIME, 10);
    lh.writeUInt16LE(DOS_DATE, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18);
    lh.writeUInt32LE(e.data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);
    chunks.push(lh, nameBuf, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);           // version made by
    ch.writeUInt16LE(20, 6);           // version needed
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(8, 10);
    ch.writeUInt16LE(DOS_TIME, 12);
    ch.writeUInt16LE(DOS_DATE, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(e.data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, nameBuf);
    offset += lh.length + nameBuf.length + comp.length;
  }
  const cdStart = offset;
  let cdSize = 0;
  for (const c of central) cdSize += c.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cdSize, 12);
  end.writeUInt32LE(cdStart, 16);
  return Buffer.concat([...chunks, ...central, end]);
}

/* ---------- helpers, как в Java ---------- */
function num(v) { const n = Number(v); return isFinite(n) ? n : 0; }
function str(v, def) { return (v === undefined || v === null) ? (def || '') : String(v); }
function escXml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function numStr(v) {
  if (v === Math.floor(v) && Math.abs(v) < 1e15) return String(Math.trunc(v));
  let s = v.toFixed(2);
  while (s.includes('.') && s.endsWith('0')) s = s.slice(0, -1);
  if (s.endsWith('.')) s = s.slice(0, -1);
  return s;
}
function pdfNum(v) {
  if (!isFinite(v)) return '';
  const neg = v < 0; v = Math.abs(v);
  let ip = Math.floor(v + 1e-9);
  let frac = Math.round((v - ip) * 100);
  if (frac === 100) { ip++; frac = 0; }
  const ipStr = String(ip);
  let g = '';
  for (let i = 0; i < ipStr.length; i++) {
    if (i > 0 && (ipStr.length - i) % 3 === 0) g += ' ';
    g += ipStr[i];
  }
  let out = g;
  if (frac !== 0) out += ',' + (frac < 10 ? '0' + frac : String(frac));
  return neg ? '-' + out : out;
}
function cText(col, row, style, text) {
  const s = style >= 0 ? ' s="' + style + '"' : '';
  return '<c r="' + col + row + '" t="inlineStr"' + s + '><is><t xml:space="preserve">' + escXml(text) + '</t></is></c>';
}
function cRich(col, row, label, value) {
  return '<c r="' + col + row + '" t="inlineStr"><is><r><rPr><b/><sz val="11"/><rFont val="Calibri"/><color rgb="FF000000"/></rPr><t xml:space="preserve">' + escXml(label) + '</t></r><r><rPr><sz val="11"/><rFont val="Calibri"/></rPr><t xml:space="preserve">' + escXml(value) + '</t></r></is></c>';
}
function cNum(col, row, style, v) {
  const s = style >= 0 ? ' s="' + style + '"' : '';
  return '<c r="' + col + row + '"' + s + '><v>' + numStr(v) + '</v></c>';
}
function cFormula(col, row, style, formula, cached) {
  const s = style >= 0 ? ' s="' + style + '"' : '';
  return '<c r="' + col + row + '"' + s + '><f>' + formula + '</f><v>' + numStr(cached) + '</v></c>';
}
function cEmpty(col, row, style) {
  const s = style >= 0 ? ' s="' + style + '"' : '';
  return '<c r="' + col + row + '"' + s + '/>';
}

/* ---- Сумма прописью (порт RuWords из Java) ---- */
function tripleWords(n, fem) {
  const hund = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];
  const tens = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
  const teens = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
  const onesM = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
  const onesF = ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
  let sb = '';
  const h = Math.floor(n / 100), rem = n % 100;
  if (h > 0) sb += hund[h] + ' ';
  if (rem >= 10 && rem < 20) sb += teens[rem - 10] + ' ';
  else {
    const tt = Math.floor(rem / 10), o = rem % 10;
    if (tt > 0) sb += tens[tt] + ' ';
    if (o > 0) sb += (fem ? onesF[o] : onesM[o]) + ' ';
  }
  return sb.trim();
}
function form(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
function sumInWords(total) {
  let rub = Math.floor(total + 1e-9);
  let kop = Math.round((total - rub) * 100);
  if (kop === 100) { rub++; kop = 0; }
  let sb = '';
  const billions = Math.floor(rub / 1000000000), millions = Math.floor(rub / 1000000) % 1000,
    thousands = Math.floor(rub / 1000) % 1000, rest = rub % 1000;
  if (billions > 0) sb += tripleWords(billions, false) + ' ' + form(billions, 'миллиард', 'миллиарда', 'миллиардов') + ' ';
  if (millions > 0) sb += tripleWords(millions, false) + ' ' + form(millions, 'миллион', 'миллиона', 'миллионов') + ' ';
  if (thousands > 0) sb += tripleWords(thousands, true) + ' ' + form(thousands, 'тысяча', 'тысячи', 'тысяч') + ' ';
  if (rest > 0 || rub === 0) sb += (rest === 0 ? 'ноль' : tripleWords(rest, false)) + ' ';
  sb += form(rub, 'рубль', 'рубля', 'рублей') + ' ';
  sb += String(kop).padStart(2, '0') + ' ' + form(kop, 'копейка', 'копейки', 'копеек');
  const s = sb.trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ---------- buildXlsx: порт Java один в один ---------- */
function buildXlsxBuffer(json) {
  const p = JSON.parse(json);
  // hideTotals: экспорт прайса — без итогов и подписей
  // (заказчик смотрит только расценки; итоги — только в смете).
  const hideTotals = !!p.hideTotals;
  let sheet = '';
  sheet += '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';
  sheet += '<cols><col min="1" max="1" width="5" customWidth="1"/><col min="2" max="2" width="62" customWidth="1"/><col min="3" max="3" width="9" customWidth="1"/><col min="4" max="4" width="12" customWidth="1"/><col min="5" max="5" width="10" customWidth="1"/><col min="6" max="6" width="8" customWidth="1"/><col min="7" max="7" width="15" customWidth="1"/></cols><sheetData>';
  let row = 1;
  const title = str(p.title, 'Смета');
  // Row 1: title, bold 14, in B (A empty with same style, like Oboi)
  sheet += '<row r="' + row + '">' + cEmpty('A', row, 3) + cText('B', row, 3, title) + '</row>'; row++;
  // Info rows, only non-empty, in B as rich text
  if (str(p.title) !== '') { sheet += '<row r="' + row + '">' + cRich('B', row, 'Название: ', title) + '</row>'; row++; }
  if (str(p.object) !== '') { sheet += '<row r="' + row + '">' + cRich('B', row, 'Объект: ', str(p.object)) + '</row>'; row++; }
  if (str(p.client) !== '') { sheet += '<row r="' + row + '">' + cRich('B', row, 'Заказчик: ', str(p.client)) + '</row>'; row++; }
  if (str(p.dateStr) !== '') { sheet += '<row r="' + row + '">' + cRich('B', row, 'Дата: ', str(p.dateStr)) + '</row>'; row++; }
  if (str(p.executor) !== '') { sheet += '<row r="' + row + '">' + cRich('B', row, 'Исполнитель: ', str(p.executor)) + '</row>'; row++; }
  sheet += '<row r="' + row + '"/>'; row++;
  const secs = Array.isArray(p.sections) ? p.sections : null;
  const sectionTotalRows = [];
  let globalNum = 0;
  if (secs) {
    secs.forEach((sec, si) => {
      // Section title: green bar A-G, title in B, centerContinuous
      sheet += '<row r="' + row + '">'
        + cEmpty('A', row, 4) + cText('B', row, 5, (si + 1) + '. ' + str(sec.title, 'Раздел'))
        + cEmpty('C', row, 4) + cEmpty('D', row, 4) + cEmpty('E', row, 4) + cEmpty('F', row, 4) + cEmpty('G', row, 4)
        + '</row>'; row++;
      // Header: dark bar
      sheet += '<row r="' + row + '">'
        + cText('A', row, 2, '№') + cText('B', row, 2, 'Наименование') + cText('C', row, 2, 'Ед.')
        + cText('D', row, 2, 'Цена, ₽') + cText('E', row, 2, 'Объём') + cText('F', row, 2, 'Коэф.') + cText('G', row, 2, 'Сумма, ₽')
        + '</row>'; row++;
      const items = Array.isArray(sec.items) ? sec.items : null;
      const firstItemRow = row;
      let lastItemRow = row - 1;
      if (items) {
        items.forEach(it => {
          globalNum++;
          const price = num(it.p), qty = num(it.q), coef = (it.k === undefined || it.k === null) ? 1 : num(it.k);
          // If cached sum differs from price*qty*coef, trust the formula result
          const formulaSum = price * qty * coef;
          sheet += '<row r="' + row + '">'
            + cNum('A', row, -1, globalNum) + cText('B', row, -1, str(it.n)) + cText('C', row, -1, str(it.u))
            + cNum('D', row, -1, price) + cNum('E', row, -1, qty) + cNum('F', row, -1, coef)
            + cFormula('G', row, -1, 'D' + row + '*E' + row + '*F' + row, formulaSum)
            + '</row>'; row++; lastItemRow = row - 1;
        });
      }
      const totalRow = row;
      const secTotal = num(sec.total);
      // «Итого по разделу» — без заливки, жирным 13 (стиль 7).
      // hideTotals: строка не пишется и её номер НЕ добавляется
      // в sectionTotalRows.
      if (!hideTotals) {
        sectionTotalRows.push(totalRow);
        sheet += '<row r="' + row + '">'
          + cEmpty('A', row, 7) + cText('B', row, 7, 'Итого по разделу')
          + cEmpty('C', row, 7) + cEmpty('D', row, 7) + cEmpty('E', row, 7) + cEmpty('F', row, 7);
        if (items && items.length > 0) sheet += cFormula('G', row, 7, 'SUM(G' + firstItemRow + ':G' + lastItemRow + ')', secTotal);
        else sheet += cNum('G', row, 7, secTotal);
        sheet += '</row>'; row++;
      }
      sheet += '<row r="' + row + '"/>'; row++;
    });
  }
  if (!!p.withSummary && secs && secs.length > 0 && !hideTotals) {
    sheet += '<row r="' + row + '">'
      + cEmpty('A', row, 4) + cText('B', row, 5, 'Сводка по разделам')
      + cEmpty('C', row, 4) + cEmpty('D', row, 4) + cEmpty('E', row, 4) + cEmpty('F', row, 4) + cEmpty('G', row, 4)
      + '</row>'; row++;
    secs.forEach((sec, si) => {
      const tr = sectionTotalRows[si];
      sheet += '<row r="' + row + '">'
        + cText('B', row, -1, str(sec.title))
        + cFormula('G', row, -1, 'G' + tr, num(sec.total))
        + '</row>'; row++;
    });
    sheet += '<row r="' + row + '"/>'; row++;
  }
  // NO "Подытог" row anywhere (как в Java): формулы используют сумму
  // итогов разделов внутри, без отдельной строки.
  let markupRow = -1, transportRow = -1;
  let sectionsSum = '';
  sectionTotalRows.forEach((tr, i) => { if (i > 0) sectionsSum += '+'; sectionsSum += 'G' + tr; });
  const markupPct = num(p.markupPct), markupSum = num(p.markupSum);
  if (markupSum !== 0 && sectionsSum.length > 0) {
    markupRow = row;
    sheet += '<row r="' + row + '">' + cText('B', row, -1, 'Наценка (' + numStr(markupPct) + '%)') + cFormula('G', row, -1, '(' + sectionsSum + ')*' + numStr(markupPct) + '/100', markupSum) + '</row>'; row++;
  }
  const transport = num(p.transport);
  if (transport !== 0) {
    transportRow = row;
    sheet += '<row r="' + row + '">' + cText('B', row, -1, 'Транспорт') + cNum('G', row, -1, transport) + '</row>'; row++;
  }
  let grandF = '';
  if (sectionsSum.length > 0) grandF += sectionsSum;
  if (markupRow > 0) { if (grandF.length > 0) grandF += '+'; grandF += 'G' + markupRow; }
  if (transportRow > 0) { if (grandF.length > 0) grandF += '+'; grandF += 'G' + transportRow; }
  // hideTotals: прайс без строки ИТОГО.
  if (!hideTotals) {
    sheet += '<row r="' + row + '">'
      + cEmpty('A', row, 6) + cText('B', row, 6, 'ИТОГО')
      + cEmpty('C', row, 6) + cEmpty('D', row, 6) + cEmpty('E', row, 6) + cEmpty('F', row, 6);
    if (grandF.length > 0) sheet += cFormula('G', row, 6, grandF, num(p.grandTotal));
    else sheet += cNum('G', row, 6, num(p.grandTotal));
    sheet += '</row>'; row++;
    sheet += '<row r="' + row + '">' + cText('B', row, -1, 'Сумма прописью: ' + sumInWords(num(p.grandTotal))) + '</row>'; row++;
    sheet += '<row r="' + row + '"/>'; row++;
    const exec = str(p.executor);
    sheet += '<row r="' + row + '">' + cText('B', row, -1, 'Исполнитель: ____________________' + (exec === '' ? '' : ' (' + exec + ')')) + '</row>'; row++;
    sheet += '<row r="' + row + '">' + cText('B', row, -1, 'Заказчик: ____________________') + '</row>'; row++;
  }
  sheet += '</sheetData></worksheet>';
  const ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>';
  const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
  const wb = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Смета" sheetId="1" r:id="rId1"/></sheets><calcPr fullCalcOnLoad="1"/></workbook>';
  const wbRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
  const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="7"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font><font><b/><sz val="12"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="12"/><name val="Calibri"/></font><font><b/><sz val="13"/><name val="Calibri"/></font></fonts><fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1E293B"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2E7D32"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8F5E9"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="8"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="4" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="4" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="centerContinuous"/></xf><xf numFmtId="0" fontId="5" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="6" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>';
  return zipStore([
    { name: '[Content_Types].xml', data: Buffer.from(ct, 'utf8') },
    { name: '_rels/.rels', data: Buffer.from(rels, 'utf8') },
    { name: 'xl/workbook.xml', data: Buffer.from(wb, 'utf8') },
    { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(wbRels, 'utf8') },
    { name: 'xl/worksheets/sheet1.xml', data: Buffer.from(sheet, 'utf8') },
    { name: 'xl/styles.xml', data: Buffer.from(styles, 'utf8') }
  ]);
}

module.exports = { buildXlsxBuffer, sumInWords, pdfNum, numStr };
