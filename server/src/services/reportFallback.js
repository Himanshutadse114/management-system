const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const fs = require('fs');

function label(key) {
  const map = {
    sales: 'Sales', paid_orders: 'Paid orders', cogs: 'COGS', gross_profit: 'Gross profit', expenses: 'Operating expenses',
    operating_profit: 'Operating P&L', inventory_value: 'Inventory value', unresolved_orders: 'Unresolved orders',
    sales_detail: 'Sales detail', product_performance: 'Product & brand performance', alcohol_ml: 'Alcohol ML consumption',
    inventory_valuation: 'Inventory valuation', stock_movements: 'Stock movements', wastage: 'Wastage & spillage', purchases: 'Purchases',
    waiter_performance: 'Waiter reconciliation', unresolved_orders_section: 'Unresolved restaurant orders', expenses_section: 'Operating expenses',
    branch_comparison: 'Branch comparison', payment_mix: 'Payment mix'
  };
  return map[key] || String(key || '').replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function reportTitle(type) {
  const map = {
    DAILY_CLOSING:'Daily Closing Report', CONSOLIDATED:'Consolidated Management Report', SALES:'Sales Detail Report', PRODUCT_PERFORMANCE:'Product & Brand Performance',
    ALCOHOL_ML:'Alcohol ML Consumption', INVENTORY_VALUATION:'Inventory Valuation', STOCK_MOVEMENTS:'Stock Movement Ledger', PURCHASES:'Purchase Report',
    WASTAGE:'Wastage & Spillage Report', WAITER_RECONCILIATION:'Waiter Reconciliation', PROFIT_MARGIN:'Profit & Margin Report', BRANCH_COMPARISON:'Branch Comparison'
  };
  return map[type] || label(type);
}

function value(raw, type) {
  if (raw == null) return '-';
  if (type === 'money') {
    try { return `INR ${(Number(BigInt(raw)) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; } catch (_) { return 'INR 0.00'; }
  }
  if (type === 'money_per_unit') {
    const n = Number(raw || 0) / 100;
    return `INR ${Number.isFinite(n) ? n.toFixed(4) : '0.0000'}`;
  }
  if (type === 'decimal' || type === 'number') {
    const n = Number(raw); return Number.isFinite(n) ? n.toLocaleString('en-IN', { maximumFractionDigits: 3 }) : String(raw);
  }
  return String(raw);
}

async function writeXlsx(payload, outputPath) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Summary');
  ws.views = [{ showGridLines: false }];
  ws.mergeCells('A1:D1');
  ws.getCell('A1').value = reportTitle(payload.reportType);
  ws.getCell('A1').font = { bold: true, size: 18, color: { argb: 'FFFFFFFF' } };
  ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF121A19' } };
  ws.getCell('A3').value = 'Business'; ws.getCell('B3').value = payload.tenant?.name || '';
  ws.getCell('A4').value = 'Scope'; ws.getCell('B4').value = payload.branch?.name || 'All branches';
  ws.getCell('A5').value = 'Period'; ws.getCell('B5').value = `${payload.range?.from || ''} - ${payload.range?.to || ''}`;
  let row = 7;
  for (const item of payload.summary || []) {
    ws.getCell(row, 1).value = label(item.key); ws.getCell(row, 1).font = { bold: true };
    ws.getCell(row, 2).value = value(item.value, item.type); row += 1;
  }
  ws.getColumn(1).width = 28; ws.getColumn(2).width = 32;

  for (const sec of payload.sections || []) {
    const title = label(sec.key === 'unresolved_orders' ? 'unresolved_orders_section' : sec.key === 'expenses' ? 'expenses_section' : sec.key).slice(0, 31);
    let name = title || 'Section'; let i = 2;
    while (wb.getWorksheet(name)) name = `${title.slice(0, 27)} ${i++}`;
    const sh = wb.addWorksheet(name); sh.views = [{ state: 'frozen', ySplit: 1, showGridLines: false }];
    const columns = sec.columns || [];
    sh.columns = columns.map((c) => ({ header: label(c.key), key: c.key, width: Math.min(35, Math.max(12, label(c.key).length + 4)) }));
    sh.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sh.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF121A19' } };
    for (const source of sec.rows || []) {
      const out = {};
      for (const c of columns) out[c.key] = value(source[c.key], c.type);
      sh.addRow(out);
    }
    sh.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, sh.rowCount), column: Math.max(1, columns.length) } };
  }
  await wb.xlsx.writeFile(outputPath);
}

async function writePdf(payload, outputPath) {
  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margins: { top: 38, left: 34, right: 34, bottom: 38 }, bufferPages: true });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);
    const title = reportTitle(payload.reportType);
    doc.rect(0, 0, doc.page.width, 105).fill('#121A19');
    doc.rect(0, 0, doc.page.width, 5).fill('#F58220');
    doc.fillColor('#FFFFFF').fontSize(22).font('Helvetica-Bold').text(title, 34, 28);
    doc.fillColor('#D0D5D3').fontSize(8).font('Helvetica').text(`${payload.tenant?.name || ''} | ${payload.branch?.name || 'All branches'} | ${payload.range?.from || ''} - ${payload.range?.to || ''}`, 34, 61);
    doc.y = 122;
    doc.fillColor('#20242A').fontSize(10).font('Helvetica-Bold').text('Summary');
    for (const item of payload.summary || []) doc.fontSize(8).font('Helvetica').fillColor('#555B61').text(`${label(item.key)}: ${value(item.value, item.type)}`);

    for (const sec of payload.sections || []) {
      if (doc.y > doc.page.height - 110) doc.addPage();
      doc.moveDown(0.8).fillColor('#20242A').fontSize(11).font('Helvetica-Bold').text(label(sec.key === 'unresolved_orders' ? 'unresolved_orders_section' : sec.key === 'expenses' ? 'expenses_section' : sec.key));
      const cols = (sec.columns || []).slice(0, 10);
      if (!(sec.rows || []).length) { doc.font('Helvetica').fontSize(8).fillColor('#777').text('No data for this section.'); continue; }
      const pageWidth = doc.page.width - 68; const cellWidth = pageWidth / Math.max(1, cols.length);
      const drawRow = (row, header = false) => {
        const y = doc.y; let h = 16;
        const values = cols.map((c) => header ? label(c.key) : value(row[c.key], c.type));
        h = Math.max(...values.map((v) => doc.heightOfString(String(v), { width: cellWidth - 6 })), 10) + 7;
        if (y + h > doc.page.height - 42) { doc.addPage(); return drawRow(row, header); }
        if (header) doc.rect(34, y, pageWidth, h).fill('#F3EEE9');
        values.forEach((v, idx) => doc.fillColor(header ? '#514B46' : '#30343A').font(header ? 'Helvetica-Bold' : 'Helvetica').fontSize(header ? 6.7 : 6.3).text(String(v), 37 + idx * cellWidth, y + 4, { width: cellWidth - 6, height: h - 5 }));
        doc.y = y + h;
      };
      drawRow({}, true);
      for (const row of (sec.rows || []).slice(0, 1000)) drawRow(row, false);
    }

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i); doc.font('Helvetica').fontSize(6.5).fillColor('#888').text(`${title} | ${i + 1}/${range.count}`, 34, doc.page.height - 24, { align: 'center', width: doc.page.width - 68 });
    }
    doc.end(); stream.on('finish', resolve); stream.on('error', reject); doc.on('error', reject);
  });
}

async function generateFallback(payload, outputPath, format) {
  if (payload.locale !== 'en') throw new Error('Multilingual reports require the Python reporting runtime.');
  if (format === 'xlsx') return writeXlsx(payload, outputPath);
  return writePdf(payload, outputPath);
}

module.exports = { generateFallback };
