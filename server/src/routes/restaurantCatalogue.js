const express = require('express');
const { Op } = require('sequelize');
const { Product, ProductPriceOption, InventoryBalance } = require('../models');
const { authenticate, requireApproved, requireBranchRoles } = require('../middleware/auth');

const router = express.Router();
const READ_ROLES = ['BRANCH_MANAGER', 'WAITER', 'CASHIER', 'AUDITOR'];

router.use(authenticate, requireApproved);

function mediaUrl(objectKey, productId) {
  if (!objectKey) return null;
  const publicBase = String(process.env.PUBLIC_MEDIA_BASE_URL || '').trim().replace(/\/$/, '');
  if (publicBase) return `${publicBase}/${objectKey}`;
  let backend = String(process.env.RENDER_EXTERNAL_URL || '').trim().replace(/\/$/, '');
  if (!backend && String(process.env.NODE_ENV || '').toLowerCase() !== 'production') {
    backend = `http://localhost:${Number(process.env.PORT || 5001)}`;
  }
  return backend && productId ? `${backend}/api/public/products/${encodeURIComponent(productId)}/image` : null;
}

router.get('/tenants/:tenantId/branches/:branchId/catalogue', requireBranchRoles(...READ_ROLES), async (req, res, next) => {
  try {
    if (!req.branch || String(req.branch.tenantId) !== String(req.params.tenantId)) {
      return res.status(404).json({ message: 'Branch not found in this tenant.' });
    }
    if (req.branch.type !== 'BAR_RESTAURANT') {
      return res.status(409).json({ message: 'Restaurant catalogue is only available for Bar + Restaurant branches.' });
    }

    const search = String(req.query.search || '').trim();
    const where = { tenantId: req.params.tenantId, status: 'ACTIVE' };
    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search.slice(0, 120)}%` } },
        { brand: { [Op.iLike]: `%${search.slice(0, 120)}%` } },
        { sku: { [Op.iLike]: `%${search.slice(0, 120)}%` } }
      ];
    }

    const products = await Product.findAll({
      where,
      attributes: ['id', 'name', 'brand', 'sku', 'productType', 'inventoryUnit', 'bottleVolumeMl', 'trackInventory', 'imageObjectKey'],
      include: [
        {
          model: ProductPriceOption,
          as: 'priceOptions',
          where: { branchId: req.params.branchId, active: true },
          required: true,
          attributes: ['id', 'label', 'quantityBaseUnits', 'priceMinor', 'sortOrder']
        },
        {
          model: InventoryBalance,
          as: 'inventoryBalances',
          where: { branchId: req.params.branchId },
          required: false,
          attributes: ['quantityBase']
        }
      ],
      order: [['name', 'ASC'], [{ model: ProductPriceOption, as: 'priceOptions' }, 'sortOrder', 'ASC']]
    });

    res.json({
      branch: { id: req.branch.id, name: req.branch.name, code: req.branch.code, type: req.branch.type, currency: req.branch.currency },
      products: products.map((product) => {
        const value = product.toJSON();
        return {
          id: value.id,
          name: value.name,
          brand: value.brand,
          sku: value.sku,
          productType: value.productType,
          inventoryUnit: value.inventoryUnit,
          bottleVolumeMl: value.bottleVolumeMl,
          imageUrl: mediaUrl(value.imageObjectKey, value.id),
          availableQuantityBase: value.inventoryBalances?.[0]?.quantityBase || '0.000',
          priceOptions: value.priceOptions || []
        };
      })
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
