const { QueryTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { Tenant, Branch } = require('../models');
const { getAnalytics, rangeFromQuery } = require('./analyticsService');

const REPORT_TYPES = [
  'DAILY_CLOSING',
  'CONSOLIDATED',
  'SALES',
  'PRODUCT_PERFORMANCE',
  'ALCOHOL_ML',
  'INVENTORY_VALUATION',
  'STOCK_MOVEMENTS',
  'PURCHASES',
  'WASTAGE',
  'WAITER_RECONCILIATION',
  'PROFIT_MARGIN',
  'BRANCH_COMPARISON'
];

const REPORT_CATALOG = [
  ['DAILY_CLOSING', 'Daily closing', 'Sales, collections and unresolved restaurant orders for a closing period.'],
  ['CONSOLIDATED', 'Consolidated management', 'Tenant-wide revenue, margin, inventory, payments, expenses and control signals.'],
  ['SALES', 'Sales detail', 'Paid order-level sales, discount, tax, COGS and gross profit detail.'],
  ['PRODUCT_PERFORMANCE', 'Product & brand performance', 'Product sales, quantity, cost and margin contribution.'],
  ['ALCOHOL_ML', 'Alcohol ML consumption', 'Alcohol volume sold by product and commercial pour/bottle option.'],
  ['INVENTORY_VALUATION', 'Inventory valuation', 'Current branch stock quantities, weighted cost and inventory value.'],
  ['STOCK_MOVEMENTS', 'Stock movements', 'Detailed purchase, sale, wastage, adjustment, return and transfer ledger.'],
  ['PURCHASES', 'Purchases', 'Purchase invoices, suppliers, products, quantities and landed cost.'],
  ['WASTAGE', 'Wastage & spillage', 'Detailed wastage movements and cost impact.'],
  ['WAITER_RECONCILIATION', 'Waiter reconciliation', 'Paid and unresolved restaurant orders grouped by accountable waiter.'],
  ['PROFIT_MARGIN', 'Profit & margin', 'Revenue, COGS, gross profit, operating expenses and operating P&L.'],
  ['BRANCH_COMPARISON', 'Branch comparison', 'Cross-outlet sales, order volume, COGS and gross-profit comparison.']
].map(([id, name, description]) => ({ id, name, description }));

async function select(sql, replacements) {
  return sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
}

function section(key, columns, rows) {
  return { key, columns, rows };
}

function col(key, type = 'text') {
  return { key, type };
}

function baseWhere(branchId, alias = 'o') {
  return branchId ? `AND ${alias}."branchId" = :branchId` : '';
}

async function orderDetails(replacements) {
  const branchFilter = baseWhere(replacements.branchId, 'o');
  return select(`SELECT o."orderNumber" AS "orderNumber", b.name AS branch, b.code AS "branchCode",
      o."orderType" AS "orderType", o.status,
      COALESCE(u.name,u.email,'-') AS staff,
      o."subtotalMinor"::text AS "subtotalMinor", o."discountMinor"::text AS "discountMinor",
      o."taxMinor"::text AS "taxMinor", o."totalMinor"::text AS "totalMinor",
      o."cogsMinor"::text AS "cogsMinor", o."grossProfitMinor"::text AS "grossProfitMinor",
      COALESCE(STRING_AGG(DISTINCT pay.method, ', '), '-') AS payment,
      COALESCE(o."paidAt",o."createdAt") AS "paidAt"
    FROM orders o
    JOIN branches b ON b.id=o."branchId" AND b."tenantId"=o."tenantId"
    LEFT JOIN users u ON u.id=COALESCE(o."waiterUserId",o."openedByUserId")
    LEFT JOIN payments pay ON pay."orderId"=o.id
    WHERE o."tenantId"=:tenantId ${branchFilter} AND o.status='PAID'
      AND DATE(timezone(COALESCE(b.timezone,'Asia/Kolkata'),COALESCE(o."paidAt",o."createdAt"))) BETWEEN CAST(:from AS date) AND CAST(:to AS date)
    GROUP BY o.id,b.id,b.name,b.code,u.name,u.email
    ORDER BY COALESCE(o."paidAt",o."createdAt") DESC
    LIMIT 2500`, replacements);
}

async function productPerformance(replacements) {
  const branchFilter = baseWhere(replacements.branchId, 'o');
  return select(`SELECT ol."productNameSnapshot" AS product, COALESCE(p.brand,'-') AS brand,
      COALESCE(p."productType",'-') AS "productType", COALESCE(p."inventoryUnit",'-') AS unit,
      COALESCE(SUM(ol."quantityUnits"),0)::text AS "quantityUnits",
      COALESCE(SUM(ol."totalBaseQuantity"),0)::text AS "baseQuantity",
      COALESCE(SUM(ol."lineSubtotalMinor"),0)::text AS "salesMinor",
      COALESCE(SUM(ol."costAmountMinor"),0)::text AS "cogsMinor",
      (COALESCE(SUM(ol."lineSubtotalMinor"),0)-COALESCE(SUM(ol."costAmountMinor"),0))::text AS "grossProfitMinor"
    FROM order_lines ol JOIN orders o ON o.id=ol."orderId" JOIN branches b ON b.id=o."branchId"
    LEFT JOIN products p ON p.id=ol."productId"
    WHERE ol."tenantId"=:tenantId ${branchFilter} AND ol.status='ACTIVE' AND o.status='PAID'
      AND DATE(timezone(COALESCE(b.timezone,'Asia/Kolkata'),COALESCE(o."paidAt",o."createdAt"))) BETWEEN CAST(:from AS date) AND CAST(:to AS date)
    GROUP BY ol."productId",ol."productNameSnapshot",p.brand,p."productType",p."inventoryUnit"
    ORDER BY SUM(ol."lineSubtotalMinor") DESC LIMIT 1000`, replacements);
}

async function alcoholConsumption(replacements) {
  const branchFilter = baseWhere(replacements.branchId, 'o');
  return select(`SELECT ol."productNameSnapshot" AS product, COALESCE(p.brand,'-') AS brand,
      COALESCE(ol."priceLabelSnapshot",'-') AS portion,
      CASE WHEN p."bottleVolumeMl" IS NOT NULL AND ol."baseQuantityPerUnit">=p."bottleVolumeMl" THEN 'BOTTLE' ELSE 'POUR' END AS mode,
      COALESCE(SUM(ol."quantityUnits"),0)::text AS "quantityUnits",
      COALESCE(SUM(ol."totalBaseQuantity"),0)::text AS "mlSold",
      COALESCE(SUM(ol."lineSubtotalMinor"),0)::text AS "salesMinor",
      COALESCE(SUM(ol."costAmountMinor"),0)::text AS "cogsMinor",
      (COALESCE(SUM(ol."lineSubtotalMinor"),0)-COALESCE(SUM(ol."costAmountMinor"),0))::text AS "grossProfitMinor"
    FROM order_lines ol JOIN orders o ON o.id=ol."orderId" JOIN branches b ON b.id=o."branchId" JOIN products p ON p.id=ol."productId"
    WHERE ol."tenantId"=:tenantId ${branchFilter} AND ol.status='ACTIVE' AND o.status='PAID' AND p."productType"='ALCOHOL'
      AND DATE(timezone(COALESCE(b.timezone,'Asia/Kolkata'),COALESCE(o."paidAt",o."createdAt"))) BETWEEN CAST(:from AS date) AND CAST(:to AS date)
    GROUP BY ol."productId",ol."productNameSnapshot",p.brand,ol."priceLabelSnapshot",p."bottleVolumeMl",ol."baseQuantityPerUnit"
    ORDER BY SUM(ol."totalBaseQuantity") DESC LIMIT 1000`, replacements);
}

async function inventoryValuation(replacements) {
  const branchFilter = replacements.branchId ? 'AND ib."branchId"=:branchId' : '';
  return select(`SELECT b.name AS branch,b.code AS "branchCode",p.name AS product,COALESCE(p.brand,'-') AS brand,
      p."productType" AS "productType",p."inventoryUnit" AS unit,
      ib."quantityBase"::text AS "quantityBase",ib."weightedAverageCostMinorPerUnit"::text AS "unitCostMinor",
      ib."inventoryValueMinor"::text AS "inventoryValueMinor"
    FROM inventory_balances ib JOIN branches b ON b.id=ib."branchId" JOIN products p ON p.id=ib."productId"
    WHERE ib."tenantId"=:tenantId ${branchFilter}
    ORDER BY b.name,p.name LIMIT 5000`, replacements);
}

async function stockMovements(replacements, onlyWastage = false) {
  const branchFilter = replacements.branchId ? 'AND im."branchId"=:branchId' : '';
  const typeFilter = onlyWastage ? `AND im."movementType"='WASTAGE'` : '';
  return select(`SELECT im."createdAt" AS date,b.name AS branch,p.name AS product,COALESCE(p.brand,'-') AS brand,
      im."movementType" AS "movementType",im."quantityDeltaBase"::text AS quantity,
      p."inventoryUnit" AS unit,im."costAmountMinor"::text AS "costMinor",
      im."stockAfterBase"::text AS "stockAfter",COALESCE(im.reason,'-') AS reason,
      COALESCE(u.name,u.email,'-') AS actor
    FROM inventory_movements im JOIN branches b ON b.id=im."branchId" JOIN products p ON p.id=im."productId"
    LEFT JOIN users u ON u.id=im."actorUserId"
    WHERE im."tenantId"=:tenantId ${branchFilter} ${typeFilter}
      AND DATE(timezone(COALESCE(b.timezone,'Asia/Kolkata'),im."createdAt")) BETWEEN CAST(:from AS date) AND CAST(:to AS date)
    ORDER BY im."createdAt" DESC LIMIT 5000`, replacements);
}

async function purchases(replacements) {
  const branchFilter = replacements.branchId ? 'AND pur."branchId"=:branchId' : '';
  return select(`SELECT pur."purchaseDate" AS date,b.name AS branch,COALESCE(s.name,'-') AS supplier,
      COALESCE(pur."invoiceNumber",'-') AS invoice,pl."productNameSnapshot" AS product,
      pl."packageCount"::text AS "packageCount",pl."packageSizeBaseUnits"::text AS "packageSize",
      pl."totalBaseUnits"::text AS "totalBaseUnits",p."inventoryUnit" AS unit,
      pl."lineTotalMinor"::text AS "lineTotalMinor"
    FROM purchase_lines pl JOIN purchases pur ON pur.id=pl."purchaseId" JOIN branches b ON b.id=pur."branchId"
    LEFT JOIN suppliers s ON s.id=pur."supplierId" LEFT JOIN products p ON p.id=pl."productId"
    WHERE pur."tenantId"=:tenantId ${branchFilter} AND pur.status='POSTED'
      AND pur."purchaseDate" BETWEEN CAST(:from AS date) AND CAST(:to AS date)
    ORDER BY pur."purchaseDate" DESC,pur."createdAt" DESC LIMIT 5000`, replacements);
}

async function unresolvedOrders(replacements) {
  const branchFilter = baseWhere(replacements.branchId, 'o');
  return select(`SELECT o."orderNumber" AS "orderNumber",b.name AS branch,COALESCE(t.name,'-') AS table,
      COALESCE(u.name,u.email,'Unassigned') AS waiter,o.status,o."totalMinor"::text AS "totalMinor",o."createdAt" AS "openedAt"
    FROM orders o JOIN branches b ON b.id=o."branchId" LEFT JOIN restaurant_tables t ON t.id=o."tableId" LEFT JOIN users u ON u.id=o."waiterUserId"
    WHERE o."tenantId"=:tenantId ${branchFilter} AND o."orderType"='RESTAURANT' AND o.status IN ('OPEN','SERVED','AWAITING_PAYMENT')
    ORDER BY o."createdAt" ASC LIMIT 1000`, replacements);
}

async function expenses(replacements) {
  const branchFilter = replacements.branchId ? 'AND e."branchId"=:branchId' : '';
  return select(`SELECT e."expenseDate" AS date,b.name AS branch,e.category,COALESCE(e.description,'-') AS description,
      e."amountMinor"::text AS "amountMinor",COALESCE(u.name,u.email,'-') AS actor
    FROM branch_expenses e JOIN branches b ON b.id=e."branchId" LEFT JOIN users u ON u.id=e."createdByUserId"
    WHERE e."tenantId"=:tenantId ${branchFilter} AND e.status='POSTED'
      AND e."expenseDate" BETWEEN CAST(:from AS date) AND CAST(:to AS date)
    ORDER BY e."expenseDate" DESC,e."createdAt" DESC LIMIT 2500`, replacements);
}

function summaryItems(analytics) {
  const s = analytics.summary || {};
  return [
    { key: 'sales', value: s.salesMinor || '0', type: 'money' },
    { key: 'paid_orders', value: String(s.paidOrders || 0), type: 'number' },
    { key: 'cogs', value: s.cogsMinor || '0', type: 'money' },
    { key: 'gross_profit', value: s.grossProfitMinor || '0', type: 'money' },
    { key: 'expenses', value: s.expenseMinor || '0', type: 'money' },
    { key: 'operating_profit', value: s.operatingProfitMinor || '0', type: 'money' },
    { key: 'inventory_value', value: analytics.inventory?.inventoryValueMinor || '0', type: 'money' },
    { key: 'unresolved_orders', value: String(analytics.unresolved?.orderCount || 0), type: 'number' }
  ];
}

async function buildReportPayload({ tenantId, branchId = null, reportType, from, to, locale = 'en' }) {
  if (!REPORT_TYPES.includes(reportType)) {
    const error = new Error(`Unsupported report type: ${reportType}`); error.status = 400; throw error;
  }
  const range = rangeFromQuery(from, to);
  const tenant = await Tenant.findByPk(tenantId, { attributes: ['id', 'name', 'slug'] });
  if (!tenant) { const error = new Error('Tenant not found.'); error.status = 404; throw error; }
  const branch = branchId ? await Branch.findOne({ where: { id: branchId, tenantId }, attributes: ['id','name','code','type','currency','timezone'] }) : null;
  if (branchId && !branch) { const error = new Error('Branch not found in this tenant.'); error.status = 404; throw error; }

  const replacements = { tenantId, branchId, ...range };
  const analytics = await getAnalytics({ tenantId, branchId, ...range });
  const sections = [];

  if (['DAILY_CLOSING','CONSOLIDATED','SALES'].includes(reportType)) {
    sections.push(section('sales_detail', [col('orderNumber'),col('branch'),col('orderType'),col('staff'),col('payment'),col('subtotalMinor','money'),col('discountMinor','money'),col('taxMinor','money'),col('totalMinor','money'),col('cogsMinor','money'),col('grossProfitMinor','money'),col('paidAt','datetime')], await orderDetails(replacements)));
  }
  if (['CONSOLIDATED','PRODUCT_PERFORMANCE','PROFIT_MARGIN'].includes(reportType)) {
    sections.push(section('product_performance', [col('product'),col('brand'),col('productType'),col('quantityUnits','number'),col('baseQuantity','decimal'),col('unit'),col('salesMinor','money'),col('cogsMinor','money'),col('grossProfitMinor','money')], await productPerformance(replacements)));
  }
  if (reportType === 'ALCOHOL_ML' || reportType === 'CONSOLIDATED') {
    sections.push(section('alcohol_ml', [col('product'),col('brand'),col('portion'),col('mode'),col('quantityUnits','number'),col('mlSold','decimal'),col('salesMinor','money'),col('cogsMinor','money'),col('grossProfitMinor','money')], await alcoholConsumption(replacements)));
  }
  if (reportType === 'INVENTORY_VALUATION' || reportType === 'CONSOLIDATED') {
    sections.push(section('inventory_valuation', [col('branch'),col('product'),col('brand'),col('productType'),col('quantityBase','decimal'),col('unit'),col('unitCostMinor','money_per_unit'),col('inventoryValueMinor','money')], await inventoryValuation(replacements)));
  }
  if (reportType === 'STOCK_MOVEMENTS') {
    sections.push(section('stock_movements', [col('date','datetime'),col('branch'),col('product'),col('brand'),col('movementType'),col('quantity','decimal'),col('unit'),col('costMinor','money'),col('stockAfter','decimal'),col('reason'),col('actor')], await stockMovements(replacements)));
  }
  if (reportType === 'WASTAGE') {
    sections.push(section('wastage', [col('date','datetime'),col('branch'),col('product'),col('brand'),col('quantity','decimal'),col('unit'),col('costMinor','money'),col('reason'),col('actor')], await stockMovements(replacements, true)));
  }
  if (reportType === 'PURCHASES') {
    sections.push(section('purchases', [col('date','date'),col('branch'),col('supplier'),col('invoice'),col('product'),col('packageCount','decimal'),col('packageSize','decimal'),col('totalBaseUnits','decimal'),col('unit'),col('lineTotalMinor','money')], await purchases(replacements)));
  }
  if (reportType === 'WAITER_RECONCILIATION' || reportType === 'DAILY_CLOSING') {
    sections.push(section('waiter_performance', [col('name'),col('email'),col('paidOrders','number'),col('unresolvedOrders','number'),col('salesMinor','money'),col('grossProfitMinor','money')], analytics.waiterPerformance || []));
    sections.push(section('unresolved_orders', [col('orderNumber'),col('branch'),col('table'),col('waiter'),col('status'),col('totalMinor','money'),col('openedAt','datetime')], await unresolvedOrders(replacements)));
  }
  if (reportType === 'PROFIT_MARGIN' || reportType === 'CONSOLIDATED') {
    sections.push(section('expenses', [col('date','date'),col('branch'),col('category'),col('description'),col('amountMinor','money'),col('actor')], await expenses(replacements)));
  }
  if (['BRANCH_COMPARISON','CONSOLIDATED','PROFIT_MARGIN'].includes(reportType)) {
    sections.push(section('branch_comparison', [col('name'),col('code'),col('type'),col('paidOrders','number'),col('salesMinor','money'),col('cogsMinor','money'),col('grossProfitMinor','money')], analytics.branches || []));
  }
  if (reportType === 'DAILY_CLOSING') {
    sections.push(section('payment_mix', [col('method'),col('paymentCount','number'),col('amountMinor','money')], analytics.paymentMix || []));
  }

  return {
    schemaVersion: 1,
    reportType,
    locale,
    generatedAt: new Date().toISOString(),
    tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
    branch: branch ? { id: branch.id, name: branch.name, code: branch.code, type: branch.type, currency: branch.currency, timezone: branch.timezone } : null,
    range,
    currency: branch?.currency || 'INR',
    summary: summaryItems(analytics),
    sections
  };
}

module.exports = { REPORT_TYPES, REPORT_CATALOG, buildReportPayload };
