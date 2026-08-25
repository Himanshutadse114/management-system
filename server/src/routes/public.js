const express = require('express');
const { Op } = require('sequelize');
const { Branch, Product, ProductPriceOption } = require('../models');
const { RestaurantTable, MenuItem } = require('../models/restaurant');

const router = express.Router();

function mediaUrl(objectKey) {
  const base = String(process.env.PUBLIC_MEDIA_BASE_URL || '').trim().replace(/\/$/, '');
  return base && objectKey ? `${base}/${objectKey}` : null;
}

router.get('/menu/:qrToken', async (req, res, next) => {
  try {
    const qrToken = String(req.params.qrToken || '').trim();
    if (!qrToken) return res.status(404).json({ message: 'Menu not found.' });

    const table = await RestaurantTable.findOne({ where: { qrToken, status: 'ACTIVE' } });
    if (!table) return res.status(404).json({ message: 'This menu link is unavailable.' });

    const branch = await Branch.findOne({
      where: { id: table.branchId, tenantId: table.tenantId, status: 'ACTIVE', type: 'BAR_RESTAURANT' },
      attributes: ['id', 'tenantId', 'name', 'code', 'address', 'phone', 'currency']
    });
    if (!branch) return res.status(404).json({ message: 'This menu link is unavailable.' });

    const menuItems = await MenuItem.findAll({
      where: { tenantId: table.tenantId, branchId: table.branchId, active: true },
      order: [['featured', 'DESC'], ['sectionName', 'ASC'], ['sortOrder', 'ASC'], ['displayName', 'ASC']]
    });

    const productIds = [...new Set(menuItems.map((item) => item.productId))];
    const products = productIds.length ? await Product.findAll({
      where: { id: { [Op.in]: productIds }, tenantId: table.tenantId, status: 'ACTIVE' },
      attributes: ['id', 'name', 'brand', 'productType', 'imageObjectKey'],
      include: [{
        model: ProductPriceOption,
        as: 'priceOptions',
        where: { branchId: table.branchId, active: true },
        required: true,
        attributes: ['id', 'label', 'quantityBaseUnits', 'priceMinor', 'sortOrder']
      }],
      order: [[{ model: ProductPriceOption, as: 'priceOptions' }, 'sortOrder', 'ASC']]
    }) : [];

    const productMap = new Map(products.map((product) => [String(product.id), product.toJSON()]));
    const items = menuItems
      .map((item) => {
        const product = productMap.get(String(item.productId));
        if (!product) return null;
        return {
          id: item.id,
          displayName: item.displayName,
          description: item.description,
          sectionName: item.sectionName,
          sortOrder: item.sortOrder,
          featured: item.featured,
          dietaryTags: Array.isArray(item.dietaryTags) ? item.dietaryTags : [],
          product: {
            id: product.id,
            name: product.name,
            brand: product.brand,
            productType: product.productType,
            imageUrl: mediaUrl(product.imageObjectKey),
            priceOptions: (product.priceOptions || []).map((price) => ({
              id: price.id,
              label: price.label,
              quantityBaseUnits: price.quantityBaseUnits,
              priceMinor: price.priceMinor
            }))
          }
        };
      })
      .filter(Boolean);

    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
    res.json({
      branch: {
        name: branch.name,
        code: branch.code,
        address: branch.address,
        phone: branch.phone,
        currency: branch.currency
      },
      table: { id: table.id, name: table.name, code: table.code, seats: table.seats },
      menu: items
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
