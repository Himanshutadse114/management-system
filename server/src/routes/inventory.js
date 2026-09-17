const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const {
  AuditLog,
  ProductCategory,
  Product,
  ProductPriceOption,
  Supplier,
  Purchase,
  PurchaseLine,
  InventoryBalance,
  InventoryMovement,
  Branch,
  PRODUCT_TYPES,
  INVENTORY_UNITS
} = require('../models');
const { authenticate, requireApproved, requireBranchRoles } = require('../middleware/auth');
const {
  positiveDecimal,
  minorInteger,
  postPurchase,
  postAdjustment,
  postTransfer
} = require('../services/inventoryService');
const { hasBranchRole } = require('../services/accessService');
const {
  listStocktakes,
  loadStocktake,
  createStocktake,
  updateStocktakeCounts,
  submitStocktake,
  postStocktake
} = require('../services/stocktakeService');
const { getObjectStorage, tenantObjectKey } = require('../storage/objectStorage');
const { InventoryBatch, SupplierReturn } = require('../models/inventoryOperations');
const { dispatchTransfer, receiveTransfer, postSupplierReturn, listTransfers } = require('../services/inventoryOperationsService');

const router = express.Router();
const ALL_BRANCH_ROLES = ['BRANCH_MANAGER', 'INVENTORY_MANAGER', 'CASHIER', 'WAITER', 'AUDITOR'];
const INVENTORY_WRITE_ROLES = ['BRANCH_MANAGER', 'INVENTORY_MANAGER'];
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter(_req, file, callback) {
    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
    if (!allowed.has(file.mimetype)) {
      const error = new Error('Product image must be JPEG, PNG or WebP.');
      error.status = 400;
      return callback(error);
    }
    callback(null, true);
  }
});

router.use(authenticate, requireApproved);

function ensureBranchTenant(req, res, next) {
  if (!req.branch || String(req.branch.tenantId) !== String(req.params.tenantId)) {
    return res.status(404).json({ message: 'Branch not found in this tenant.', code: 'BRANCH_SCOPE_MISMATCH' });
  }
  next();
}

function branchReadAccess(req, res, next) {
  return requireBranchRoles(...ALL_BRANCH_ROLES)(req, res, (error) => {
    if (error) return next(error);
    ensureBranchTenant(req, res, next);
  });
}

function branchInventoryWriteAccess(req, res, next) {
  return requireBranchRoles(...INVENTORY_WRITE_ROLES)(req, res, (error) => {
    if (error) return next(error);
    ensureBranchTenant(req, res, next);
  });
}

async function audit(req, action, entityType, entityId, metadata = null) {
  await AuditLog.create({
    tenantId: req.params.tenantId,
    branchId: req.params.branchId,
    actorUserId: req.userId,
    action,
    entityType,
    entityId: entityId ? String(entityId) : null,
    metadata,
    ipAddress: req.ip || null
  });
}

function cleanText(value, max = 255) {
  const text = String(value || '').trim();
  return text ? text.slice(0, max) : null;
}

function imageUrl(objectKey) {
  const base = String(process.env.PUBLIC_MEDIA_BASE_URL || '').trim().replace(/\/$/, '');
  return base && objectKey ? `${base}/${objectKey}` : null;
}

function serializeProduct(product) {
  const value = product.toJSON ? product.toJSON() : product;
  return { ...value, imageUrl: imageUrl(value.imageObjectKey) };
}

async function verifyCategory(tenantId, categoryId, transaction = null) {
  if (!categoryId) return null;
  const category = await ProductCategory.findOne({
    where: { id: categoryId, tenantId, status: 'ACTIVE' },
    transaction
  });
  if (!category) {
    const error = new Error('Product category not found in this tenant.');
    error.status = 400;
    throw error;
  }
  return category;
}

async function createPriceOptions({ tenantId, branchId, product, options, transaction }) {
  if (!Array.isArray(options)) return [];
  const created = [];
  for (const [index, option] of options.entries()) {
    const label = cleanText(option?.label, 80);
    if (!label) {
      const error = new Error(`Price option ${index + 1} requires a label.`);
      error.status = 400;
      throw error;
    }
    const quantity = positiveDecimal(option?.quantityBaseUnits, `Price option ${index + 1} quantity`).toDecimalPlaces(3);
    const priceMinor = minorInteger(option?.priceMinor, `Price option ${index + 1} priceMinor`);
    if (product.productType === 'ALCOHOL' && product.bottleVolumeMl && quantity.gt(product.bottleVolumeMl)) {
      const error = new Error(`Price option ${label} cannot exceed the bottle volume of ${product.bottleVolumeMl} ML.`);
      error.status = 400;
      throw error;
    }

    const row = await ProductPriceOption.create({
      tenantId,
      branchId,
      productId: product.id,
      label,
      quantityBaseUnits: quantity.toFixed(3),
      priceMinor: priceMinor.toString(),
      active: option?.active !== false,
      sortOrder: Number.isInteger(option?.sortOrder) ? option.sortOrder : index
    }, { transaction });
    created.push(row);
  }
  return created;
}

router.get('/tenants/:tenantId/branches/:branchId/categories', branchReadAccess, async (req, res, next) => {
  try {
    const categories = await ProductCategory.findAll({
      where: { tenantId: req.params.tenantId, status: 'ACTIVE' },
      order: [['sortOrder', 'ASC'], ['name', 'ASC']]
    });
    res.json({ categories });
  } catch (error) { next(error); }
});

router.post('/tenants/:tenantId/branches/:branchId/categories', branchInventoryWriteAccess, async (req, res, next) => {
  try {
    const name = cleanText(req.body?.name, 120);
    if (!name || name.length < 2) return res.status(400).json({ message: 'Category name is required.' });
    const [category, created] = await ProductCategory.findOrCreate({
      where: { tenantId: req.params.tenantId, name },
      defaults: {
        tenantId: req.params.tenantId,
        name,
        sortOrder: Number.isInteger(req.body?.sortOrder) ? req.body.sortOrder : 0,
        status: 'ACTIVE'
      }
    });
    if (!created && category.status !== 'ACTIVE') {
      category.status = 'ACTIVE';
      await category.save();
    }
    await audit(req, created ? 'PRODUCT_CATEGORY_CREATED' : 'PRODUCT_CATEGORY_REACTIVATED', 'ProductCategory', category.id, { name });
    res.status(created ? 201 : 200).json({ category });
  } catch (error) {
    if (error?.name === 'SequelizeUniqueConstraintError') return res.status(409).json({ message: 'Category already exists.' });
    next(error);
  }
});

router.get('/tenants/:tenantId/branches/:branchId/products', branchReadAccess, async (req, res, next) => {
  try {
    const status = String(req.query.status || 'ACTIVE').toUpperCase();
    const search = cleanText(req.query.search, 120);
    const where = { tenantId: req.params.tenantId };
    if (status !== 'ALL') where.status = status;
    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { brand: { [Op.iLike]: `%${search}%` } },
        { sku: { [Op.iLike]: `%${search}%` } },
        { barcode: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const products = await Product.findAll({
      where,
      include: [
        { model: ProductCategory, as: 'category', required: false },
        {
          model: ProductPriceOption,
          as: 'priceOptions',
          where: { branchId: req.params.branchId },
          required: false
        },
        {
          model: InventoryBalance,
          as: 'inventoryBalances',
          where: { branchId: req.params.branchId },
          required: false
        }
      ],
      order: [['name', 'ASC'], [{ model: ProductPriceOption, as: 'priceOptions' }, 'sortOrder', 'ASC']]
    });
    res.json({ products: products.map(serializeProduct) });
  } catch (error) { next(error); }
});

router.post('/tenants/:tenantId/branches/:branchId/products', branchInventoryWriteAccess, async (req, res, next) => {
  try {
    const tenantId = req.params.tenantId;
    const branchId = req.params.branchId;
    const name = cleanText(req.body?.name, 180);
    const productType = String(req.body?.productType || 'OTHER').toUpperCase();
    const inventoryUnit = String(req.body?.inventoryUnit || (productType === 'ALCOHOL' ? 'ML' : 'PIECE')).toUpperCase();
    const sku = cleanText(req.body?.sku, 80)?.toUpperCase() || null;
    const barcode = cleanText(req.body?.barcode, 120);
    const brand = cleanText(req.body?.brand, 140);

    if (!name || name.length < 2) return res.status(400).json({ message: 'Product name is required.' });
    if (!PRODUCT_TYPES.includes(productType)) return res.status(400).json({ message: `productType must be one of: ${PRODUCT_TYPES.join(', ')}` });
    if (!INVENTORY_UNITS.includes(inventoryUnit)) return res.status(400).json({ message: `inventoryUnit must be one of: ${INVENTORY_UNITS.join(', ')}` });

    let bottleVolumeMl = req.body?.bottleVolumeMl == null || req.body?.bottleVolumeMl === '' ? null : positiveDecimal(req.body.bottleVolumeMl, 'bottleVolumeMl').toFixed(3);
    if (productType === 'ALCOHOL') {
      if (inventoryUnit !== 'ML') return res.status(400).json({ message: 'Alcohol products must use ML inventory.' });
      if (!bottleVolumeMl) return res.status(400).json({ message: 'Alcohol products require bottleVolumeMl.' });
    } else {
      bottleVolumeMl = null;
    }

    const result = await sequelize.transaction(async (transaction) => {
      await verifyCategory(tenantId, req.body?.categoryId, transaction);
      const product = await Product.create({
        tenantId,
        categoryId: req.body?.categoryId || null,
        sku,
        barcode,
        name,
        brand,
        productType,
        inventoryUnit,
        bottleVolumeMl,
        trackInventory: req.body?.trackInventory !== false,
        status: 'ACTIVE'
      }, { transaction });
      const priceOptions = await createPriceOptions({
        tenantId,
        branchId,
        product,
        options: req.body?.priceOptions || [],
        transaction
      });
      return { product, priceOptions };
    });

    await audit(req, 'PRODUCT_CREATED', 'Product', result.product.id, {
      name,
      sku,
      productType,
      inventoryUnit,
      bottleVolumeMl,
      priceOptionCount: result.priceOptions.length
    });
    res.status(201).json({ product: serializeProduct({ ...result.product.toJSON(), priceOptions: result.priceOptions }) });
  } catch (error) {
    if (error?.name === 'SequelizeUniqueConstraintError') return res.status(409).json({ message: 'SKU or price option already exists in this scope.' });
    next(error);
  }
});

router.patch('/tenants/:tenantId/branches/:branchId/products/:productId', branchInventoryWriteAccess, async (req, res, next) => {
  try {
    const product = await Product.findOne({ where: { id: req.params.productId, tenantId: req.params.tenantId } });
    if (!product) return res.status(404).json({ message: 'Product not found.' });

    if (req.body?.categoryId !== undefined) {
      await verifyCategory(req.params.tenantId, req.body.categoryId);
      product.categoryId = req.body.categoryId || null;
    }
    if (req.body?.name !== undefined) product.name = cleanText(req.body.name, 180) || product.name;
    if (req.body?.brand !== undefined) product.brand = cleanText(req.body.brand, 140);
    if (req.body?.barcode !== undefined) product.barcode = cleanText(req.body.barcode, 120);
    if (req.body?.sku !== undefined) product.sku = cleanText(req.body.sku, 80)?.toUpperCase() || null;
    if (req.body?.status !== undefined) product.status = String(req.body.status).toUpperCase();
    await product.save();

    await audit(req, 'PRODUCT_UPDATED', 'Product', product.id, { fields: Object.keys(req.body || {}) });
    res.json({ product: serializeProduct(product) });
  } catch (error) {
    if (error?.name === 'SequelizeUniqueConstraintError') return res.status(409).json({ message: 'SKU already exists in this tenant.' });
    next(error);
  }
});

router.post('/tenants/:tenantId/branches/:branchId/products/:productId/prices', branchInventoryWriteAccess, async (req, res, next) => {
  try {
    const product = await Product.findOne({ where: { id: req.params.productId, tenantId: req.params.tenantId, status: 'ACTIVE' } });
    if (!product) return res.status(404).json({ message: 'Product not found.' });
    const label = cleanText(req.body?.label, 80);
    if (!label) return res.status(400).json({ message: 'Price option label is required.' });
    const quantity = positiveDecimal(req.body?.quantityBaseUnits, 'quantityBaseUnits');
    const priceMinor = minorInteger(req.body?.priceMinor, 'priceMinor');
    if (product.productType === 'ALCOHOL' && product.bottleVolumeMl && quantity.gt(product.bottleVolumeMl)) {
      return res.status(400).json({ message: `Portion cannot exceed bottle volume ${product.bottleVolumeMl} ML.` });
    }

    const [priceOption, created] = await ProductPriceOption.findOrCreate({
      where: { branchId: req.params.branchId, productId: product.id, label },
      defaults: {
        tenantId: req.params.tenantId,
        branchId: req.params.branchId,
        productId: product.id,
        label,
        quantityBaseUnits: quantity.toFixed(3),
        priceMinor: priceMinor.toString(),
        active: true,
        sortOrder: Number.isInteger(req.body?.sortOrder) ? req.body.sortOrder : 0
      }
    });
    if (!created) {
      priceOption.quantityBaseUnits = quantity.toFixed(3);
      priceOption.priceMinor = priceMinor.toString();
      priceOption.active = req.body?.active !== false;
      if (Number.isInteger(req.body?.sortOrder)) priceOption.sortOrder = req.body.sortOrder;
      await priceOption.save();
    }
    await audit(req, created ? 'PRODUCT_PRICE_CREATED' : 'PRODUCT_PRICE_UPDATED', 'ProductPriceOption', priceOption.id, { productId: product.id, label });
    res.status(created ? 201 : 200).json({ priceOption });
  } catch (error) { next(error); }
});

router.post('/tenants/:tenantId/branches/:branchId/products/:productId/image', branchInventoryWriteAccess, imageUpload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Image file is required.' });
    const product = await Product.findOne({ where: { id: req.params.productId, tenantId: req.params.tenantId } });
    if (!product) return res.status(404).json({ message: 'Product not found.' });

    const extByMime = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
    const filename = `${crypto.randomUUID()}.${extByMime[req.file.mimetype]}`;
    const key = tenantObjectKey({
      tenantId: req.params.tenantId,
      branchId: req.params.branchId,
      category: 'products',
      entityId: product.id,
      filename
    });
    const storage = getObjectStorage();
    const oldKey = product.imageObjectKey;
    await storage.putObject({ key, body: req.file.buffer, contentType: req.file.mimetype });
    product.imageObjectKey = key;
    await product.save();
    if (oldKey && oldKey !== key) storage.deleteObject(oldKey).catch(() => {});

    await audit(req, 'PRODUCT_IMAGE_UPDATED', 'Product', product.id, { objectKey: key, size: req.file.size });
    res.json({ product: serializeProduct(product) });
  } catch (error) { next(error); }
});

router.get('/tenants/:tenantId/branches/:branchId/suppliers', branchReadAccess, async (req, res, next) => {
  try {
    const suppliers = await Supplier.findAll({
      where: { tenantId: req.params.tenantId, status: 'ACTIVE' },
      order: [['name', 'ASC']]
    });
    res.json({ suppliers });
  } catch (error) { next(error); }
});

router.post('/tenants/:tenantId/branches/:branchId/suppliers', branchInventoryWriteAccess, async (req, res, next) => {
  try {
    const name = cleanText(req.body?.name, 180);
    if (!name || name.length < 2) return res.status(400).json({ message: 'Supplier name is required.' });
    const supplier = await Supplier.create({
      tenantId: req.params.tenantId,
      name,
      phone: cleanText(req.body?.phone, 40),
      email: cleanText(req.body?.email, 320)?.toLowerCase() || null,
      gstin: cleanText(req.body?.gstin, 40)?.toUpperCase() || null,
      address: cleanText(req.body?.address, 2000),
      status: 'ACTIVE'
    });
    await audit(req, 'SUPPLIER_CREATED', 'Supplier', supplier.id, { name, gstin: supplier.gstin });
    res.status(201).json({ supplier });
  } catch (error) { next(error); }
});

router.get('/tenants/:tenantId/branches/:branchId/purchases', branchReadAccess, async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
    const purchases = await Purchase.findAll({
      where: { tenantId: req.params.tenantId, branchId: req.params.branchId },
      include: [
        { model: Supplier, as: 'supplier', required: false },
        { model: PurchaseLine, as: 'lines', required: false }
      ],
      order: [['purchaseDate', 'DESC'], ['createdAt', 'DESC']],
      limit
    });
    res.json({ purchases });
  } catch (error) { next(error); }
});

router.post('/tenants/:tenantId/branches/:branchId/purchases', branchInventoryWriteAccess, async (req, res, next) => {
  try {
    if (req.body?.supplierId) {
      const supplier = await Supplier.findOne({ where: { id: req.body.supplierId, tenantId: req.params.tenantId, status: 'ACTIVE' } });
      if (!supplier) return res.status(400).json({ message: 'Supplier not found in this tenant.' });
    }
    const purchaseDate = cleanText(req.body?.purchaseDate, 10) || new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate)) return res.status(400).json({ message: 'purchaseDate must be YYYY-MM-DD.' });
    const idempotencyKey = cleanText(req.header('Idempotency-Key') || req.body?.idempotencyKey, 180);
    const result = await postPurchase({
      tenantId: req.params.tenantId,
      branchId: req.params.branchId,
      supplierId: req.body?.supplierId || null,
      invoiceNumber: req.body?.invoiceNumber,
      purchaseDate,
      notes: req.body?.notes,
      idempotencyKey,
      lines: req.body?.lines,
      actorUserId: req.userId
    });
    if (!result.replayed) {
      await audit(req, 'PURCHASE_POSTED', 'Purchase', result.purchase.id, {
        invoiceNumber: result.purchase.invoiceNumber,
        totalMinor: result.purchase.totalMinor,
        lineCount: result.purchase.lines?.length || 0
      });
    }
    res.status(result.replayed ? 200 : 201).json(result);
  } catch (error) {
    if (error?.name === 'SequelizeUniqueConstraintError') return res.status(409).json({ message: 'Duplicate purchase request.' });
    next(error);
  }
});

router.get('/tenants/:tenantId/branches/:branchId/stock', branchReadAccess, async (req, res, next) => {
  try {
    const balances = await InventoryBalance.findAll({
      where: { tenantId: req.params.tenantId, branchId: req.params.branchId },
      include: [{ model: Product, as: 'product', where: { tenantId: req.params.tenantId }, required: true }],
      order: [[{ model: Product, as: 'product' }, 'name', 'ASC']]
    });
    res.json({ balances: balances.map((row) => ({ ...row.toJSON(), product: serializeProduct(row.product) })) });
  } catch (error) { next(error); }
});

router.get('/tenants/:tenantId/branches/:branchId/movements', branchReadAccess, async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 200);
    const where = { tenantId: req.params.tenantId, branchId: req.params.branchId };
    if (req.query.productId) where.productId = String(req.query.productId);
    if (req.query.type) where.movementType = String(req.query.type).toUpperCase();
    const movements = await InventoryMovement.findAll({
      where,
      include: [{ model: Product, as: 'product', attributes: ['id', 'name', 'sku', 'inventoryUnit', 'bottleVolumeMl'] }],
      order: [['createdAt', 'DESC']],
      limit
    });
    res.json({ movements });
  } catch (error) { next(error); }
});

router.post('/tenants/:tenantId/branches/:branchId/adjustments', branchInventoryWriteAccess, async (req, res, next) => {
  try {
    if (!cleanText(req.body?.reason, 2000)) return res.status(400).json({ message: 'Adjustment reason is required.' });
    const result = await postAdjustment({
      tenantId: req.params.tenantId,
      branchId: req.params.branchId,
      productId: req.body?.productId,
      quantityDeltaBase: req.body?.quantityDeltaBase,
      costAmountMinor: req.body?.costAmountMinor,
      reason: req.body?.reason,
      idempotencyKey: cleanText(req.header('Idempotency-Key') || req.body?.idempotencyKey, 180),
      actorUserId: req.userId
    });
    if (!result.replayed) {
      await audit(req, 'INVENTORY_ADJUSTED', 'InventoryMovement', result.movement.id, {
        productId: req.body?.productId,
        quantityDeltaBase: result.movement.quantityDeltaBase,
        reason: req.body?.reason
      });
    }
    res.status(result.replayed ? 200 : 201).json(result);
  } catch (error) { next(error); }
});

router.post('/tenants/:tenantId/branches/:branchId/wastage', branchInventoryWriteAccess, async (req, res, next) => {
  try {
    const quantity = positiveDecimal(req.body?.quantityBase, 'quantityBase');
    if (!cleanText(req.body?.reason, 2000)) return res.status(400).json({ message: 'Wastage reason is required.' });
    const result = await postAdjustment({
      tenantId: req.params.tenantId,
      branchId: req.params.branchId,
      productId: req.body?.productId,
      quantityDeltaBase: quantity.negated(),
      reason: req.body?.reason,
      idempotencyKey: cleanText(req.header('Idempotency-Key') || req.body?.idempotencyKey, 180),
      actorUserId: req.userId,
      movementType: 'WASTAGE'
    });
    if (!result.replayed) {
      await audit(req, 'INVENTORY_WASTAGE_RECORDED', 'InventoryMovement', result.movement.id, {
        productId: req.body?.productId,
        quantityBase: quantity.toFixed(3),
        reason: req.body?.reason
      });
    }
    res.status(result.replayed ? 200 : 201).json(result);
  } catch (error) { next(error); }
});

router.post('/tenants/:tenantId/branches/:branchId/transfers', branchInventoryWriteAccess, async (req, res, next) => {
  try {
    const tenantId = req.params.tenantId;
    const sourceBranchId = req.params.branchId;
    const destinationBranchId = cleanText(req.body?.destinationBranchId, 100);
    const productId = cleanText(req.body?.productId, 100);
    const reason = cleanText(req.body?.reason, 2000);

    if (!destinationBranchId || !productId) {
      return res.status(400).json({ message: 'Destination branch and product are required.' });
    }
    if (!reason) return res.status(400).json({ message: 'Transfer reason is required.' });

    const destination = await Branch.findOne({
      where: { id: destinationBranchId, tenantId, status: 'ACTIVE' }
    });
    if (!destination) return res.status(404).json({ message: 'Destination branch not found in this business.' });
    if (!(await hasBranchRole(req.user, destination, INVENTORY_WRITE_ROLES))) {
      return res.status(403).json({
        message: 'Stock access is required for both the source and destination branches.',
        code: 'TRANSFER_DESTINATION_ACCESS_DENIED'
      });
    }

    const result = await postTransfer({
      tenantId,
      sourceBranchId,
      destinationBranchId,
      productId,
      quantityBase: req.body?.quantityBase,
      reason,
      idempotencyKey: cleanText(req.body?.idempotencyKey, 145),
      actorUserId: req.auditActorUserId || req.userId
    });
    await audit(req, 'INVENTORY_TRANSFERRED', 'InventoryMovement', result.transferId, {
      sourceBranchId,
      destinationBranchId,
      productId,
      quantityBase: String(req.body?.quantityBase),
      replayed: result.replayed
    });
    res.status(result.replayed ? 200 : 201).json(result);
  } catch (error) { next(error); }
});

router.get('/tenants/:tenantId/branches/:branchId/batches', branchReadAccess, async (req, res, next) => {
  try {
    const batches = await InventoryBatch.findAll({ where: { tenantId: req.params.tenantId, branchId: req.params.branchId }, order: [sequelize.literal('"expiresAt" ASC NULLS LAST'), ['createdAt', 'DESC']], limit: 300 });
    res.json({ batches });
  } catch (error) { next(error); }
});

router.get('/tenants/:tenantId/branches/:branchId/transfer-orders', branchReadAccess, async (req, res, next) => {
  try { res.json({ transfers: await listTransfers({ tenantId: req.params.tenantId, branchId: req.params.branchId }) }); }
  catch (error) { next(error); }
});

router.post('/tenants/:tenantId/branches/:branchId/transfer-orders', branchInventoryWriteAccess, async (req, res, next) => {
  try {
    const destinationBranchId = cleanText(req.body?.destinationBranchId, 100);
    const reason = cleanText(req.body?.reason, 2000);
    if (!destinationBranchId || !reason) return res.status(400).json({ message: 'Destination and transfer reason are required.' });
    const destination = await Branch.findOne({ where: { id: destinationBranchId, tenantId: req.params.tenantId, status: 'ACTIVE' } });
    if (!destination) return res.status(404).json({ message: 'Destination branch not found.' });
    if (!(await hasBranchRole(req.user, destination, INVENTORY_WRITE_ROLES))) return res.status(403).json({ message: 'Stock access is required for both branches.', code: 'TRANSFER_DESTINATION_ACCESS_DENIED' });
    const result = await dispatchTransfer({ tenantId: req.params.tenantId, sourceBranchId: req.params.branchId, destinationBranchId, lines: req.body?.lines, reason, idempotencyKey: cleanText(req.body?.idempotencyKey, 180), actorUserId: req.userId });
    if (!result.replayed) await audit(req, 'STOCK_TRANSFER_DISPATCHED', 'StockTransfer', result.transfer.id, { transferNumber: result.transfer.transferNumber, destinationBranchId, lineCount: result.transfer.lines?.length || 0 });
    res.status(result.replayed ? 200 : 201).json(result);
  } catch (error) { next(error); }
});

router.post('/tenants/:tenantId/branches/:branchId/transfer-orders/:transferId/receive', branchInventoryWriteAccess, async (req, res, next) => {
  try {
    const result = await receiveTransfer({ tenantId: req.params.tenantId, destinationBranchId: req.params.branchId, transferId: req.params.transferId, actorUserId: req.userId });
    if (!result.replayed) await audit(req, 'STOCK_TRANSFER_RECEIVED', 'StockTransfer', result.transfer.id, { transferNumber: result.transfer.transferNumber });
    res.json(result);
  } catch (error) { next(error); }
});

router.get('/tenants/:tenantId/branches/:branchId/supplier-returns', branchReadAccess, async (req, res, next) => {
  try { res.json({ returns: await SupplierReturn.findAll({ where: { tenantId: req.params.tenantId, branchId: req.params.branchId }, order: [['createdAt', 'DESC']], limit: 100 }) }); }
  catch (error) { next(error); }
});

router.post('/tenants/:tenantId/branches/:branchId/supplier-returns', branchInventoryWriteAccess, async (req, res, next) => {
  try {
    const reason = cleanText(req.body?.reason, 2000);
    if (!reason) return res.status(400).json({ message: 'Supplier return reason is required.' });
    const result = await postSupplierReturn({ tenantId: req.params.tenantId, branchId: req.params.branchId, supplierId: req.body?.supplierId, productId: req.body?.productId, batchId: req.body?.batchId || null, quantityBase: req.body?.quantityBase, creditMinor: req.body?.creditMinor, reason, idempotencyKey: cleanText(req.body?.idempotencyKey, 180), actorUserId: req.userId });
    if (!result.replayed) await audit(req, 'SUPPLIER_RETURN_POSTED', 'SupplierReturn', result.supplierReturn.id, { returnNumber: result.supplierReturn.returnNumber, supplierId: result.supplierReturn.supplierId, quantityBase: result.supplierReturn.quantityBase, creditMinor: result.supplierReturn.creditMinor });
    res.status(result.replayed ? 200 : 201).json(result);
  } catch (error) { next(error); }
});

router.get('/tenants/:tenantId/branches/:branchId/stocktakes', branchReadAccess, async (req, res, next) => {
  try {
    const stocktakes = await listStocktakes({
      tenantId: req.params.tenantId,
      branchId: req.params.branchId,
      limit: req.query.limit
    });
    res.json({ stocktakes });
  } catch (error) { next(error); }
});

router.get('/tenants/:tenantId/branches/:branchId/stocktakes/:stocktakeId', branchReadAccess, async (req, res, next) => {
  try {
    const stocktake = await loadStocktake({
      tenantId: req.params.tenantId,
      branchId: req.params.branchId,
      stocktakeId: req.params.stocktakeId
    });
    if (!stocktake) return res.status(404).json({ message: 'Stocktake not found.' });
    res.json({ stocktake });
  } catch (error) { next(error); }
});

router.post('/tenants/:tenantId/branches/:branchId/stocktakes', branchInventoryWriteAccess, async (req, res, next) => {
  try {
    const stocktake = await createStocktake({
      tenantId: req.params.tenantId,
      branchId: req.params.branchId,
      name: req.body?.name,
      notes: req.body?.notes,
      actorUserId: req.userId
    });
    await audit(req, 'STOCKTAKE_STARTED', 'Stocktake', stocktake.id, { name: stocktake.name, lineCount: stocktake.lines?.length || 0 });
    res.status(201).json({ stocktake });
  } catch (error) {
    if (error?.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: 'Finish or post the current stocktake before starting another.', code: 'STOCKTAKE_ALREADY_OPEN' });
    }
    next(error);
  }
});

router.patch('/tenants/:tenantId/branches/:branchId/stocktakes/:stocktakeId/lines', branchInventoryWriteAccess, async (req, res, next) => {
  try {
    const stocktake = await updateStocktakeCounts({
      tenantId: req.params.tenantId,
      branchId: req.params.branchId,
      stocktakeId: req.params.stocktakeId,
      counts: req.body?.counts
    });
    await audit(req, 'STOCKTAKE_COUNTS_UPDATED', 'Stocktake', stocktake.id, { updatedLineCount: req.body?.counts?.length || 0 });
    res.json({ stocktake });
  } catch (error) { next(error); }
});

router.post('/tenants/:tenantId/branches/:branchId/stocktakes/:stocktakeId/submit', branchInventoryWriteAccess, async (req, res, next) => {
  try {
    const stocktake = await submitStocktake({
      tenantId: req.params.tenantId,
      branchId: req.params.branchId,
      stocktakeId: req.params.stocktakeId,
      actorUserId: req.userId
    });
    await audit(req, 'STOCKTAKE_SUBMITTED', 'Stocktake', stocktake.id, { lineCount: stocktake.lines?.length || 0 });
    res.json({ stocktake });
  } catch (error) { next(error); }
});

router.post('/tenants/:tenantId/branches/:branchId/stocktakes/:stocktakeId/post', branchInventoryWriteAccess, async (req, res, next) => {
  try {
    if (!(await hasBranchRole(req.user, req.branch, ['BRANCH_MANAGER']))) {
      return res.status(403).json({ message: 'A Branch Manager or Tenant Admin must approve and post a stocktake.', code: 'STOCKTAKE_APPROVAL_REQUIRED' });
    }
    const result = await postStocktake({
      tenantId: req.params.tenantId,
      branchId: req.params.branchId,
      stocktakeId: req.params.stocktakeId,
      actorUserId: req.userId
    });
    if (!result.replayed) {
      await audit(req, 'STOCKTAKE_POSTED', 'Stocktake', result.stocktake.id, {
        lineCount: result.stocktake.lines?.length || 0,
        varianceLineCount: (result.stocktake.lines || []).filter((line) => Number(line.varianceQuantityBase) !== 0).length
      });
    }
    res.json(result);
  } catch (error) { next(error); }
});

router.get('/tenants/:tenantId/branches/:branchId/summary', branchReadAccess, async (req, res, next) => {
  try {
    const [productCount, balances, movementCount, purchaseCount] = await Promise.all([
      Product.count({ where: { tenantId: req.params.tenantId, status: 'ACTIVE' } }),
      InventoryBalance.findAll({ where: { tenantId: req.params.tenantId, branchId: req.params.branchId } }),
      InventoryMovement.count({ where: { tenantId: req.params.tenantId, branchId: req.params.branchId } }),
      Purchase.count({ where: { tenantId: req.params.tenantId, branchId: req.params.branchId, status: 'POSTED' } })
    ]);
    const inventoryValueMinor = balances.reduce((total, row) => total + BigInt(row.inventoryValueMinor || 0), 0n).toString();
    const stockedProducts = balances.filter((row) => Number(row.quantityBase) > 0).length;
    res.json({
      summary: {
        productCount,
        stockedProducts,
        movementCount,
        purchaseCount,
        inventoryValueMinor
      }
    });
  } catch (error) { next(error); }
});

module.exports = router;
