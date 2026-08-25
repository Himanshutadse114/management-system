const { QueryTypes } = require('sequelize');
const { sequelize } = require('../config/database');

function isoDate(value, fallback) {
  const text = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return fallback;
}

function defaultRange() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${d}` };
}

function rangeFromQuery(from, to) {
  const defaults = defaultRange();
  const resolved = { from: isoDate(from, defaults.from), to: isoDate(to, defaults.to) };
  if (resolved.from > resolved.to) {
    const error = new Error('Analytics from date must be on or before to date.');
    error.status = 400;
    throw error;
  }
  const days = Math.ceil((Date.parse(`${resolved.to}T00:00:00Z`) - Date.parse(`${resolved.from}T00:00:00Z`)) / 86400000);
  if (days > 366) {
    const error = new Error('Analytics range cannot exceed 366 days.');
    error.status = 400;
    throw error;
  }
  return resolved;
}

function safeBigInt(value) {
  try { return BigInt(value || 0); } catch (_) { return 0n; }
}

async function select(sql, replacements) {
  return sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
}

async function getAnalytics({ tenantId, branchId = null, from, to }) {
  const range = rangeFromQuery(from, to);
  const replacements = { tenantId, branchId, ...range };
  const branchOrderFilter = branchId ? 'AND o."branchId" = :branchId' : '';
  const branchBalanceFilter = branchId ? 'AND ib."branchId" = :branchId' : '';
  const branchMovementFilter = branchId ? 'AND im."branchId" = :branchId' : '';
  const branchExpenseFilter = branchId ? 'AND e."branchId" = :branchId' : '';
  const branchBaseFilter = branchId ? 'AND b.id = :branchId' : '';

  const paidRangeCondition = `o.status = 'PAID' ${branchOrderFilter}
    AND DATE(timezone(COALESCE(b.timezone, 'Asia/Kolkata'), COALESCE(o."paidAt", o."createdAt"))) BETWEEN CAST(:from AS date) AND CAST(:to AS date)`;

  const [summaryRows, todayRows, mtdRows, branchRows, paymentRows, productRows, alcoholRows, trendRows, inventoryRows, lowStockRows, wastageRows, unresolvedRows, waiterRows, expenseRows, expenseCategoryRows] = await Promise.all([
    select(`SELECT
      COUNT(*)::int AS "paidOrders",
      COALESCE(SUM(o."totalMinor"),0)::text AS "salesMinor",
      COALESCE(SUM(o."cogsMinor"),0)::text AS "cogsMinor",
      COALESCE(SUM(o."grossProfitMinor"),0)::text AS "grossProfitMinor",
      COALESCE(SUM(o."discountMinor"),0)::text AS "discountMinor",
      COALESCE(SUM(o."taxMinor"),0)::text AS "taxMinor",
      COUNT(*) FILTER (WHERE o."orderType" = 'RESTAURANT')::int AS "restaurantOrders",
      COUNT(*) FILTER (WHERE o."orderType" IN ('COUNTER','WINE_SHOP'))::int AS "counterOrders"
    FROM orders o JOIN branches b ON b.id=o."branchId" AND b."tenantId"=o."tenantId"
    WHERE o."tenantId"=:tenantId AND ${paidRangeCondition}`, replacements),

    select(`SELECT COUNT(*)::int AS "paidOrders", COALESCE(SUM(o."totalMinor"),0)::text AS "salesMinor", COALESCE(SUM(o."grossProfitMinor"),0)::text AS "grossProfitMinor"
      FROM orders o JOIN branches b ON b.id=o."branchId" AND b."tenantId"=o."tenantId"
      WHERE o."tenantId"=:tenantId AND o.status='PAID' ${branchOrderFilter}
      AND DATE(timezone(COALESCE(b.timezone,'Asia/Kolkata'), COALESCE(o."paidAt",o."createdAt"))) = DATE(timezone(COALESCE(b.timezone,'Asia/Kolkata'), NOW()))`, replacements),

    select(`SELECT COUNT(*)::int AS "paidOrders", COALESCE(SUM(o."totalMinor"),0)::text AS "salesMinor", COALESCE(SUM(o."grossProfitMinor"),0)::text AS "grossProfitMinor"
      FROM orders o JOIN branches b ON b.id=o."branchId" AND b."tenantId"=o."tenantId"
      WHERE o."tenantId"=:tenantId AND o.status='PAID' ${branchOrderFilter}
      AND DATE(timezone(COALESCE(b.timezone,'Asia/Kolkata'), COALESCE(o."paidAt",o."createdAt"))) >= DATE_TRUNC('month', timezone(COALESCE(b.timezone,'Asia/Kolkata'), NOW()))::date
      AND DATE(timezone(COALESCE(b.timezone,'Asia/Kolkata'), COALESCE(o."paidAt",o."createdAt"))) <= DATE(timezone(COALESCE(b.timezone,'Asia/Kolkata'), NOW()))`, replacements),

    select(`SELECT b.id AS "branchId", b.name, b.code, b.type,
      COUNT(o.id)::int AS "paidOrders",
      COALESCE(SUM(o."totalMinor"),0)::text AS "salesMinor",
      COALESCE(SUM(o."cogsMinor"),0)::text AS "cogsMinor",
      COALESCE(SUM(o."grossProfitMinor"),0)::text AS "grossProfitMinor"
      FROM branches b LEFT JOIN orders o ON o."branchId"=b.id AND o."tenantId"=b."tenantId" AND o.status='PAID'
        AND DATE(timezone(COALESCE(b.timezone,'Asia/Kolkata'), COALESCE(o."paidAt",o."createdAt"))) BETWEEN CAST(:from AS date) AND CAST(:to AS date)
      WHERE b."tenantId"=:tenantId AND b.status='ACTIVE' ${branchBaseFilter}
      GROUP BY b.id,b.name,b.code,b.type ORDER BY COALESCE(SUM(o."totalMinor"),0) DESC`, replacements),

    select(`SELECT p.method, COUNT(*)::int AS "paymentCount", COALESCE(SUM(p."amountMinor"),0)::text AS "amountMinor"
      FROM payments p JOIN orders o ON o.id=p."orderId" JOIN branches b ON b.id=o."branchId"
      WHERE p."tenantId"=:tenantId AND ${paidRangeCondition}
      GROUP BY p.method ORDER BY SUM(p."amountMinor") DESC`, replacements),

    select(`SELECT ol."productId", ol."productNameSnapshot" AS name, p.brand, p."productType", p."inventoryUnit",
      SUM(ol."quantityUnits")::text AS "quantityUnits",
      COALESCE(SUM(ol."totalBaseQuantity"),0)::text AS "baseQuantity",
      COALESCE(SUM(ol."lineSubtotalMinor"),0)::text AS "salesMinor",
      COALESCE(SUM(ol."costAmountMinor"),0)::text AS "cogsMinor",
      (COALESCE(SUM(ol."lineSubtotalMinor"),0)-COALESCE(SUM(ol."costAmountMinor"),0))::text AS "grossProfitMinor"
      FROM order_lines ol JOIN orders o ON o.id=ol."orderId" JOIN branches b ON b.id=o."branchId" LEFT JOIN products p ON p.id=ol."productId"
      WHERE ol."tenantId"=:tenantId AND ol.status='ACTIVE' AND ${paidRangeCondition}
      GROUP BY ol."productId",ol."productNameSnapshot",p.brand,p."productType",p."inventoryUnit"
      ORDER BY SUM(ol."lineSubtotalMinor") DESC LIMIT 12`, replacements),

    select(`SELECT CASE WHEN p."bottleVolumeMl" IS NOT NULL AND ol."baseQuantityPerUnit" >= p."bottleVolumeMl" THEN 'BOTTLE' ELSE 'POUR' END AS mode,
      COALESCE(SUM(ol."totalBaseQuantity"),0)::text AS "mlSold",
      COALESCE(SUM(ol."lineSubtotalMinor"),0)::text AS "salesMinor",
      COUNT(*)::int AS lines
      FROM order_lines ol JOIN orders o ON o.id=ol."orderId" JOIN branches b ON b.id=o."branchId" JOIN products p ON p.id=ol."productId"
      WHERE ol."tenantId"=:tenantId AND ol.status='ACTIVE' AND p."productType"='ALCOHOL' AND ${paidRangeCondition}
      GROUP BY mode ORDER BY mode`, replacements),

    select(`SELECT DATE(timezone(COALESCE(b.timezone,'Asia/Kolkata'), COALESCE(o."paidAt",o."createdAt")))::text AS date,
      COALESCE(SUM(o."totalMinor"),0)::text AS "salesMinor", COALESCE(SUM(o."grossProfitMinor"),0)::text AS "grossProfitMinor", COUNT(*)::int AS orders
      FROM orders o JOIN branches b ON b.id=o."branchId"
      WHERE o."tenantId"=:tenantId AND ${paidRangeCondition}
      GROUP BY date ORDER BY date ASC`, replacements),

    select(`SELECT COALESCE(SUM(ib."inventoryValueMinor"),0)::text AS "inventoryValueMinor",
      COALESCE(SUM(ib."quantityBase") FILTER (WHERE p."inventoryUnit"='ML'),0)::text AS "totalMlOnHand",
      COUNT(*) FILTER (WHERE ib."quantityBase">0)::int AS "stockedProducts"
      FROM inventory_balances ib JOIN products p ON p.id=ib."productId"
      WHERE ib."tenantId"=:tenantId ${branchBalanceFilter}`, replacements),

    select(`SELECT ib."branchId", b.name AS "branchName", p.id AS "productId", p.name, p.brand, p."productType", p."inventoryUnit", p."bottleVolumeMl",
      ib."quantityBase"::text AS "quantityBase", ib."inventoryValueMinor"::text AS "inventoryValueMinor"
      FROM inventory_balances ib JOIN products p ON p.id=ib."productId" JOIN branches b ON b.id=ib."branchId"
      WHERE ib."tenantId"=:tenantId ${branchBalanceFilter} AND p."trackInventory"=TRUE AND p.status='ACTIVE'
        AND ib."quantityBase" <= CASE WHEN p."productType"='ALCOHOL' AND p."bottleVolumeMl" IS NOT NULL THEN p."bottleVolumeMl" ELSE 5 END
      ORDER BY ib."quantityBase" ASC LIMIT 20`, replacements),

    select(`SELECT COUNT(*)::int AS movements, COALESCE(SUM(ABS(im."quantityDeltaBase")),0)::text AS "quantityBase",
      COALESCE(SUM(ABS(im."costAmountMinor")),0)::text AS "costMinor"
      FROM inventory_movements im JOIN branches b ON b.id=im."branchId"
      WHERE im."tenantId"=:tenantId ${branchMovementFilter} AND im."movementType"='WASTAGE'
      AND DATE(timezone(COALESCE(b.timezone,'Asia/Kolkata'), im."createdAt")) BETWEEN CAST(:from AS date) AND CAST(:to AS date)`, replacements),

    select(`SELECT COUNT(*)::int AS "orderCount", COALESCE(SUM(o."totalMinor"),0)::text AS "totalMinor",
      COUNT(DISTINCT o."waiterUserId")::int AS "waitersAffected"
      FROM orders o WHERE o."tenantId"=:tenantId ${branchOrderFilter} AND o."orderType"='RESTAURANT'
      AND o.status IN ('OPEN','SERVED','AWAITING_PAYMENT')`, replacements),

    select(`SELECT o."waiterUserId" AS "userId", COALESCE(u.name,u.email,'Unassigned') AS name, u.email,
      COUNT(*) FILTER (WHERE o.status='PAID')::int AS "paidOrders",
      COUNT(*) FILTER (WHERE o.status IN ('OPEN','SERVED','AWAITING_PAYMENT'))::int AS "unresolvedOrders",
      COALESCE(SUM(o."totalMinor") FILTER (WHERE o.status='PAID'),0)::text AS "salesMinor",
      COALESCE(SUM(o."grossProfitMinor") FILTER (WHERE o.status='PAID'),0)::text AS "grossProfitMinor"
      FROM orders o LEFT JOIN users u ON u.id=o."waiterUserId" JOIN branches b ON b.id=o."branchId"
      WHERE o."tenantId"=:tenantId ${branchOrderFilter} AND o."orderType"='RESTAURANT'
        AND (o.status IN ('OPEN','SERVED','AWAITING_PAYMENT') OR (o.status='PAID' AND DATE(timezone(COALESCE(b.timezone,'Asia/Kolkata'),COALESCE(o."paidAt",o."createdAt"))) BETWEEN CAST(:from AS date) AND CAST(:to AS date)))
      GROUP BY o."waiterUserId",u.name,u.email ORDER BY "salesMinor"::numeric DESC`, replacements),

    select(`SELECT COALESCE(SUM(e."amountMinor"),0)::text AS "expenseMinor", COUNT(*)::int AS "expenseCount"
      FROM branch_expenses e WHERE e."tenantId"=:tenantId ${branchExpenseFilter} AND e.status='POSTED'
      AND e."expenseDate" BETWEEN CAST(:from AS date) AND CAST(:to AS date)`, replacements),

    select(`SELECT e.category, COUNT(*)::int AS count, COALESCE(SUM(e."amountMinor"),0)::text AS "amountMinor"
      FROM branch_expenses e WHERE e."tenantId"=:tenantId ${branchExpenseFilter} AND e.status='POSTED'
      AND e."expenseDate" BETWEEN CAST(:from AS date) AND CAST(:to AS date)
      GROUP BY e.category ORDER BY SUM(e."amountMinor") DESC`, replacements)
  ]);

  const summary = summaryRows[0] || {};
  const expenses = expenseRows[0] || { expenseMinor: '0', expenseCount: 0 };
  const operatingProfitMinor = (safeBigInt(summary.grossProfitMinor) - safeBigInt(expenses.expenseMinor)).toString();

  return {
    range,
    scope: { tenantId, branchId },
    summary: { ...summary, expenseMinor: expenses.expenseMinor || '0', expenseCount: expenses.expenseCount || 0, operatingProfitMinor },
    today: todayRows[0] || { paidOrders: 0, salesMinor: '0', grossProfitMinor: '0' },
    mtd: mtdRows[0] || { paidOrders: 0, salesMinor: '0', grossProfitMinor: '0' },
    branches: branchRows,
    paymentMix: paymentRows,
    topProducts: productRows,
    alcoholMix: alcoholRows,
    salesTrend: trendRows,
    inventory: inventoryRows[0] || { inventoryValueMinor: '0', totalMlOnHand: '0', stockedProducts: 0 },
    lowStock: lowStockRows,
    wastage: wastageRows[0] || { movements: 0, quantityBase: '0', costMinor: '0' },
    unresolved: unresolvedRows[0] || { orderCount: 0, totalMinor: '0', waitersAffected: 0 },
    waiterPerformance: waiterRows,
    expenseCategories: expenseCategoryRows
  };
}

module.exports = { getAnalytics, rangeFromQuery };
