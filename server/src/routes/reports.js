const express = require('express');
const { Op } = require('sequelize');
const { AuditLog, Branch } = require('../models');
const { GeneratedReport, REPORT_FORMATS, REPORT_LOCALES } = require('../models/reports');
const { authenticate, requireApproved } = require('../middleware/auth');
const { REPORT_TYPES, REPORT_CATALOG } = require('../services/reportDataService');
const { generateReport, reportBuffer } = require('../services/reportService');

const router = express.Router();
router.use(authenticate, requireApproved);

function tenantMembership(req, tenantId) {
  return (req.access?.tenants || []).find((row) => String(row.tenantId) === String(tenantId) && ['TENANT_ADMIN', 'AUDITOR'].includes(row.role));
}

function branchMembership(req, tenantId, branchId) {
  return (req.access?.branches || []).find((row) => String(row.tenantId) === String(tenantId) && String(row.branchId) === String(branchId) && ['BRANCH_MANAGER', 'AUDITOR'].includes(row.role));
}

function canAccessScope(req, tenantId, branchId = null) {
  if (req.access?.isSuperAdmin) return true;
  if (tenantMembership(req, tenantId)) return true;
  if (branchId && branchMembership(req, tenantId, branchId)) return true;
  return false;
}

function reportJson(report) {
  return {
    id: report.id,
    tenantId: report.tenantId,
    branchId: report.branchId,
    reportType: report.reportType,
    format: report.format,
    locale: report.locale,
    rangeFrom: report.rangeFrom,
    rangeTo: report.rangeTo,
    status: report.status,
    fileName: report.fileName,
    contentType: report.contentType,
    sizeBytes: report.sizeBytes,
    errorMessage: report.status === 'FAILED' ? report.errorMessage : null,
    completedAt: report.completedAt,
    createdAt: report.createdAt
  };
}

async function audit(req, tenantId, branchId, action, report, metadata = null) {
  await AuditLog.create({
    tenantId,
    branchId: branchId || null,
    actorUserId: req.userId,
    action,
    entityType: 'GeneratedReport',
    entityId: report?.id ? String(report.id) : null,
    metadata,
    ipAddress: req.ip || null
  });
}

router.get('/catalog', (_req, res) => {
  res.json({
    formats: REPORT_FORMATS,
    locales: [
      { id: 'en', name: 'English' },
      { id: 'hi', name: 'हिन्दी' },
      { id: 'mr', name: 'मराठी' }
    ],
    reports: REPORT_CATALOG
  });
});

router.post('/tenants/:tenantId/generate', async (req, res, next) => {
  try {
    const tenantId = req.params.tenantId;
    const branchId = req.body?.branchId ? String(req.body.branchId) : null;
    if (!canAccessScope(req, tenantId, branchId)) {
      return res.status(403).json({ message: 'Report access denied for this scope.', code: 'REPORT_ACCESS_DENIED' });
    }
    if (!branchId && !req.access?.isSuperAdmin && !tenantMembership(req, tenantId)) {
      return res.status(403).json({ message: 'Branch-level users must select their assigned branch.' });
    }
    if (branchId) {
      const branch = await Branch.findOne({ where: { id: branchId, tenantId, status: 'ACTIVE' } });
      if (!branch) return res.status(404).json({ message: 'Active branch not found in this tenant.' });
    }

    const reportType = String(req.body?.reportType || '').toUpperCase();
    const format = String(req.body?.format || 'PDF').toUpperCase();
    const locale = String(req.body?.locale || 'en').toLowerCase();
    if (!REPORT_TYPES.includes(reportType)) return res.status(400).json({ message: `reportType must be one of: ${REPORT_TYPES.join(', ')}` });
    if (!REPORT_FORMATS.includes(format)) return res.status(400).json({ message: `format must be one of: ${REPORT_FORMATS.join(', ')}` });
    if (!REPORT_LOCALES.includes(locale)) return res.status(400).json({ message: `locale must be one of: ${REPORT_LOCALES.join(', ')}` });

    const result = await generateReport({
      tenantId,
      branchId,
      reportType,
      format,
      locale,
      from: req.body?.from,
      to: req.body?.to,
      createdByUserId: req.userId
    });
    await audit(req, tenantId, branchId, 'REPORT_GENERATED', result.report, { reportType, format, locale, generator: result.generator });
    res.status(201).json({ report: reportJson(result.report), generator: result.generator });
  } catch (error) { next(error); }
});

router.get('/tenants/:tenantId/history', async (req, res, next) => {
  try {
    const tenantId = req.params.tenantId;
    const branchId = req.query.branchId ? String(req.query.branchId) : null;
    if (!canAccessScope(req, tenantId, branchId)) {
      return res.status(403).json({ message: 'Report access denied for this scope.', code: 'REPORT_ACCESS_DENIED' });
    }
    const where = { tenantId };
    if (branchId) where.branchId = branchId;
    else if (!req.access?.isSuperAdmin && !tenantMembership(req, tenantId)) {
      const allowed = (req.access?.branches || []).filter((row) => String(row.tenantId) === String(tenantId) && ['BRANCH_MANAGER', 'AUDITOR'].includes(row.role)).map((row) => row.branchId);
      if (!allowed.length) return res.json({ reports: [] });
      where.branchId = { [Op.in]: allowed };
    }
    const reports = await GeneratedReport.findAll({ where, order: [['createdAt', 'DESC']], limit: 100 });
    res.json({ reports: reports.map(reportJson) });
  } catch (error) { next(error); }
});

router.get('/tenants/:tenantId/:reportId/download', async (req, res, next) => {
  try {
    const report = await GeneratedReport.findOne({ where: { id: req.params.reportId, tenantId: req.params.tenantId } });
    if (!report) return res.status(404).json({ message: 'Report not found.' });
    if (!canAccessScope(req, report.tenantId, report.branchId)) {
      return res.status(403).json({ message: 'Report download access denied.', code: 'REPORT_ACCESS_DENIED' });
    }
    const buffer = await reportBuffer(report);
    const safeName = String(report.fileName || `report.${report.format === 'XLSX' ? 'xlsx' : 'pdf'}`).replace(/["\r\n]/g, '');
    res.setHeader('Content-Type', report.contentType || 'application/octet-stream');
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    await audit(req, report.tenantId, report.branchId, 'REPORT_DOWNLOADED', report, { reportType: report.reportType, format: report.format });
    res.end(buffer);
  } catch (error) { next(error); }
});

module.exports = router;
