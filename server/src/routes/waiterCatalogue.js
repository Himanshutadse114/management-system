const express = require('express');
const { Op } = require('sequelize');
const { Product, ProductPriceOption, InventoryBalance } = require('../models');
const { MenuItem } = require('../models/restaurant');
const { authenticate, requireApproved, requireBranchRoles } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireApproved);

function waiterScope(req, res, next) {
  return requireBranchRoles('WAITER')(req, res, (error) => {
    if (error) return next(error);
    if (!req.branch || String(req.branch.tenantId) !== String(req.params.tenantId)) {
      return res.status(404).json({ message: 'Branch not found in this tenant.' });
    }
    if (req.branch.type !== 'BAR_RESTAURANT') {
      return res.status(409).json({ message: 'Table service is only available for Bar + Restaurant branches.' });
    }
    next();
  });
}

function mediaUrl(objectKey) {
  const base = String(process.env.PUBLIC_MEDIA_BASE_URL || '').trim().replace(/\/$/, '');
  return base && objectKey ? `${base}/${objectKey}` : null;
}

router.get('/waiter/tenants/:tenantId/branches/:branchId/catalogue', waiterScope, async (req, res, next) => {
  try {
    const menuItems = await MenuItem.findAll({
      where: {
        tenantId: req.params.tenantId,
        branchId: req.params.branchId,
        active: true
      },
      attributes: ['id', 'productId', 'displayName', 'description', 'sectionName', 'featured', 'dietaryTags', 'sortOrder'],
      order: [['sectionName', 'ASC'], ['sortOrder', 'ASC'], ['displayName', 'ASC']]
    });

    const productIds = [...new Set(menuItems.map((item) => item.productId).filter(Boolean))];
    if (!productIds.length) {
      return res.json({
        branch: { id: req.branch.id, name: req.branch.name, code: req.branch.code, type: req.branch.type, currency: req.branch.currency },
        products: []
      });
    }

    const products = await Product.findAll({
      where: {
        id: { [Op.in]: productIds },
        tenantId: req.params.tenantId,
        status: 'ACTIVE'
      },
      attributes: ['id', 'name', 'brand', 'productType', 'trackInventory', 'imageObjectKey'],
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
      ]
    });

    const productMap = new Map(products.map((product) => [String(product.id), product.toJSON()]));
    const rows = menuItems.map((item) => {
      const product = productMap.get(String(item.productId));
      if (!product) return null;
      const available = product.trackInventory === false || Number(product.inventoryBalances?.[0]?.quantityBase || 0) > 0;
      return {
        id: product.id,
        menuItemId: item.id,
        name: item.displayName || product.name,
        description: item.description,
        sectionName: item.sectionName,
        featured: Boolean(item.featured),
        dietaryTags: Array.isArray(item.dietaryTags) ? item.dietaryTags : [],
        brand: product.brand,
        productType: product.productType,
        imageUrl: mediaUrl(product.imageObjectKey),
        available,
        priceOptions: available ? (product.priceOptions || []).sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0)) : []
      };
    }).filter(Boolean);

    res.json({
      branch: { id: req.branch.id, name: req.branch.name, code: req.branch.code, type: req.branch.type, currency: req.branch.currency },
      products: rows
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
