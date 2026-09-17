const express = require('express');
const { AuditLog, BranchSettings } = require('../models');
const { PAYMENT_METHODS } = require('../models/sales');
const { authenticate, requireApproved, requireBranchRoles } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireApproved);

function managerScope(req, res, next) {
  return requireBranchRoles('BRANCH_MANAGER')(req, res, (error) => {
    if (error) return next(error);
    if (String(req.branch.tenantId) !== String(req.params.tenantId)) return res.status(404).json({ message: 'Branch not found in this business.' });
    next();
  });
}

function defaults(req) {
  return {
    tenantId: req.params.tenantId,
    branchId: req.params.branchId,
    legalName: null,
    gstin: null,
    fssaiNumber: null,
    stateCode: null,
    invoicePrefix: req.branch.code || 'INV',
    receiptFooter: 'Thank you for visiting.',
    defaultTaxRateBps: 0,
    serviceChargeRateBps: 0,
    allowedPaymentMethods: ['CASH', 'CARD', 'UPI'],
    upiVpa: null,
    opensAt: null,
    closesAt: null,
    businessDayCloseAt: '04:00',
    requireShiftForBilling: true
  };
}

function clean(value, max) { const text = String(value || '').trim(); return text ? text.slice(0, max) : null; }
function rate(value, label) {
  const number = Number(value ?? 0);
  if (!Number.isInteger(number) || number < 0 || number > 10000) { const error = new Error(`${label} must be between 0 and 10000 basis points.`); error.status = 400; throw error; }
  return number;
}
function time(value, label, required = false) {
  const text = clean(value, 5);
  if (!text && !required) return null;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text || '')) { const error = new Error(`${label} must use 24-hour HH:MM format.`); error.status = 400; throw error; }
  return text;
}

router.get('/tenants/:tenantId/branches/:branchId', managerScope, async (req, res, next) => {
  try {
    const settings = await BranchSettings.findOne({ where: { tenantId: req.params.tenantId, branchId: req.params.branchId } });
    res.json({ settings: settings || defaults(req) });
  } catch (error) { next(error); }
});

router.patch('/tenants/:tenantId/branches/:branchId', managerScope, async (req, res, next) => {
  try {
    const gstin = clean(req.body?.gstin, 15)?.toUpperCase() || null;
    if (gstin && !/^[0-9A-Z]{15}$/.test(gstin)) return res.status(400).json({ message: 'GSTIN must contain exactly 15 letters/numbers.' });
    const stateCode = clean(req.body?.stateCode, 2);
    if (stateCode && !/^\d{2}$/.test(stateCode)) return res.status(400).json({ message: 'State code must contain 2 digits.' });
    const methods = [...new Set((Array.isArray(req.body?.allowedPaymentMethods) ? req.body.allowedPaymentMethods : []).map((value) => String(value).toUpperCase()))];
    if (!methods.length || methods.some((method) => !PAYMENT_METHODS.includes(method))) return res.status(400).json({ message: `Choose one or more payment methods: ${PAYMENT_METHODS.join(', ')}.` });
    const values = {
      ...defaults(req),
      legalName: clean(req.body?.legalName, 200), gstin,
      fssaiNumber: clean(req.body?.fssaiNumber, 32)?.toUpperCase() || null,
      stateCode,
      invoicePrefix: clean(req.body?.invoicePrefix, 24)?.toUpperCase() || req.branch.code || 'INV',
      receiptFooter: clean(req.body?.receiptFooter, 2000),
      defaultTaxRateBps: rate(req.body?.defaultTaxRateBps, 'defaultTaxRateBps'),
      serviceChargeRateBps: rate(req.body?.serviceChargeRateBps, 'serviceChargeRateBps'),
      allowedPaymentMethods: methods,
      upiVpa: clean(req.body?.upiVpa, 120)?.toLowerCase() || null,
      opensAt: time(req.body?.opensAt, 'opensAt'),
      closesAt: time(req.body?.closesAt, 'closesAt'),
      businessDayCloseAt: time(req.body?.businessDayCloseAt || '04:00', 'businessDayCloseAt', true),
      requireShiftForBilling: req.body?.requireShiftForBilling !== false
    };
    const [settings, created] = await BranchSettings.findOrCreate({
      where: { branchId: req.params.branchId }, defaults: values
    });
    if (!created) await settings.update(values);
    await AuditLog.create({ tenantId: req.params.tenantId, branchId: req.params.branchId, actorUserId: req.auditActorUserId || req.userId, action: 'BRANCH_SETTINGS_UPDATED', entityType: 'BranchSettings', entityId: String(settings.id), metadata: { fields: Object.keys(req.body || {}) }, ipAddress: req.ip || null });
    res.json({ settings });
  } catch (error) { next(error); }
});

module.exports = router;
