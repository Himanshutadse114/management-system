const { Op, QueryTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { OperationalShift, User, BranchMembership } = require('../models');
const { minorInteger } = require('./inventoryService');

const SHIFT_ROLES = ['CASHIER', 'WAITER'];

function shiftError(message, status = 400, code = null) {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  return error;
}

function safeMinor(value, label) {
  return minorInteger(value == null || value === '' ? '0' : value, label).toString();
}

async function cashReceived({ tenantId, branchId, userId, openedAt, until = new Date(), transaction = null }) {
  const rows = await sequelize.query(`
    SELECT (
      COALESCE((SELECT SUM(p."amountMinor")
        FROM payments p JOIN orders o ON o.id = p."orderId"
        WHERE p."tenantId" = :tenantId AND p."branchId" = :branchId
          AND p."receivedByUserId" = :userId AND p.method = 'CASH'
          AND p."createdAt" >= :openedAt AND p."createdAt" <= :until), 0)
      - COALESCE((SELECT SUM(r."amountMinor") FROM sales_refunds r
        WHERE r."tenantId" = :tenantId AND r."branchId" = :branchId
          AND r."cashierUserId" = :userId AND r.method = 'CASH'
          AND r."processedAt" >= :openedAt AND r."processedAt" <= :until), 0)
    )::text AS "cashMinor"
  `, {
    replacements: { tenantId, branchId, userId, openedAt, until },
    type: QueryTypes.SELECT,
    transaction
  });
  return BigInt(rows[0]?.cashMinor || 0);
}

async function getCurrentShift({ tenantId, branchId, userId, role }) {
  const where = { tenantId, branchId, userId, status: { [Op.in]: ['OPEN', 'SUBMITTED'] } };
  if (role) where.role = role;
  const shift = await OperationalShift.findOne({ where, order: [['openedAt', 'DESC']] });
  if (!shift) return null;
  if (shift.status === 'OPEN' && shift.role === 'CASHIER') {
    const received = await cashReceived({ tenantId, branchId, userId, openedAt: shift.openedAt });
    const value = shift.toJSON();
    value.liveExpectedCashMinor = (BigInt(shift.openingFloatMinor || 0) + received).toString();
    return value;
  }
  return shift;
}

async function listShifts({ tenantId, branchId, status = null, limit = 100 }) {
  const where = { tenantId, branchId };
  if (status) where.status = String(status).toUpperCase();
  return OperationalShift.findAll({
    where,
    include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }],
    order: [['openedAt', 'DESC']],
    limit: Math.min(Math.max(Number(limit || 100), 1), 200)
  });
}

async function openShift({ tenantId, branchId, userId, role, openingFloatMinor = '0', idempotencyKey = null }) {
  const normalizedRole = String(role || '').toUpperCase();
  if (!SHIFT_ROLES.includes(normalizedRole)) throw shiftError(`role must be one of: ${SHIFT_ROLES.join(', ')}`);
  const opening = normalizedRole === 'CASHIER' ? safeMinor(openingFloatMinor, 'openingFloatMinor') : '0';
  const safeKey = idempotencyKey ? String(idempotencyKey).trim().slice(0, 180) : null;

  if (safeKey) {
    const replay = await OperationalShift.findOne({ where: { tenantId, idempotencyKey: safeKey } });
    if (replay) return { shift: replay, replayed: true };
  }

  return sequelize.transaction(async (transaction) => {
    const existing = await OperationalShift.findOne({
      where: { tenantId, branchId, userId, role: normalizedRole, status: { [Op.in]: ['OPEN', 'SUBMITTED'] } },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (existing) throw shiftError('You already have an open or submitted shift in this branch.', 409, 'SHIFT_ALREADY_OPEN');
    const shift = await OperationalShift.create({
      tenantId, branchId, userId, role: normalizedRole, status: 'OPEN',
      openingFloatMinor: opening, openedAt: new Date(), idempotencyKey: safeKey
    }, { transaction });
    return { shift, replayed: false };
  });
}

async function submitShift({ tenantId, branchId, shiftId, userId, declaredCashMinor = '0', closeNote = null, handedOverToUserId = null }) {
  return sequelize.transaction(async (transaction) => {
    const shift = await OperationalShift.findOne({
      where: { id: shiftId, tenantId, branchId, userId }, transaction, lock: transaction.LOCK.UPDATE
    });
    if (!shift) throw shiftError('Shift not found.', 404);
    if (shift.status !== 'OPEN') throw shiftError('Only an open shift can be submitted.', 409, 'SHIFT_NOT_OPEN');

    if (handedOverToUserId) {
      const membership = await BranchMembership.findOne({
        where: { tenantId, branchId, userId: handedOverToUserId, role: shift.role, status: 'ACTIVE' }, transaction
      });
      if (!membership) throw shiftError(`Handover user must be an active ${shift.role.toLowerCase()} in this branch.`);
    }

    const submittedAt = new Date();
    let expected = 0n;
    let declared = 0n;
    if (shift.role === 'CASHIER') {
      const received = await cashReceived({ tenantId, branchId, userId, openedAt: shift.openedAt, until: submittedAt, transaction });
      expected = BigInt(shift.openingFloatMinor || 0) + received;
      declared = BigInt(safeMinor(declaredCashMinor, 'declaredCashMinor'));
    }
    shift.expectedCashMinor = expected.toString();
    shift.declaredCashMinor = declared.toString();
    shift.varianceMinor = (declared - expected).toString();
    shift.closeNote = closeNote ? String(closeNote).trim().slice(0, 2000) : null;
    shift.handedOverToUserId = handedOverToUserId || null;
    shift.status = 'SUBMITTED';
    shift.submittedAt = submittedAt;
    await shift.save({ transaction });
    return shift;
  });
}

async function approveShift({ tenantId, branchId, shiftId, approvedByUserId, approvalNote = null }) {
  return sequelize.transaction(async (transaction) => {
    const shift = await OperationalShift.findOne({
      where: { id: shiftId, tenantId, branchId }, transaction, lock: transaction.LOCK.UPDATE
    });
    if (!shift) throw shiftError('Shift not found.', 404);
    if (shift.status === 'CLOSED') return { shift, replayed: true };
    if (shift.status !== 'SUBMITTED') throw shiftError('The staff member must submit the shift before approval.', 409, 'SHIFT_NOT_SUBMITTED');
    if (BigInt(shift.varianceMinor || 0) !== 0n && !String(approvalNote || '').trim()) {
      throw shiftError('An approval note is required when cash has a variance.', 400, 'SHIFT_VARIANCE_NOTE_REQUIRED');
    }
    shift.status = 'CLOSED';
    shift.closedAt = new Date();
    shift.approvedByUserId = approvedByUserId;
    shift.approvalNote = approvalNote ? String(approvalNote).trim().slice(0, 2000) : null;
    await shift.save({ transaction });
    return { shift, replayed: false };
  });
}

module.exports = { SHIFT_ROLES, cashReceived, getCurrentShift, listShifts, openShift, submitShift, approveShift };
