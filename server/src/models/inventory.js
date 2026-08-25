module.exports = function defineInventoryModels(sequelize, DataTypes) {
  const ProductCategory = sequelize.define('ProductCategory', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenantId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(120), allowNull: false },
    sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    status: { type: DataTypes.STRING(24), allowNull: false, defaultValue: 'ACTIVE' }
  }, {
    tableName: 'product_categories',
    indexes: [
      { unique: true, fields: ['tenantId', 'name'], name: 'product_category_tenant_name_unique' },
      { fields: ['tenantId', 'status', 'sortOrder'] }
    ]
  });

  const Product = sequelize.define('Product', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenantId: { type: DataTypes.UUID, allowNull: false },
    categoryId: { type: DataTypes.UUID, allowNull: true },
    sku: { type: DataTypes.STRING(80), allowNull: true },
    barcode: { type: DataTypes.STRING(120), allowNull: true },
    name: { type: DataTypes.STRING(180), allowNull: false },
    brand: { type: DataTypes.STRING(140), allowNull: true },
    productType: { type: DataTypes.STRING(24), allowNull: false, defaultValue: 'OTHER' },
    inventoryUnit: { type: DataTypes.STRING(24), allowNull: false, defaultValue: 'PIECE' },
    bottleVolumeMl: { type: DataTypes.DECIMAL(18, 3), allowNull: true },
    trackInventory: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    imageObjectKey: { type: DataTypes.TEXT, allowNull: true },
    status: { type: DataTypes.STRING(24), allowNull: false, defaultValue: 'ACTIVE' }
  }, {
    tableName: 'products',
    indexes: [
      { unique: true, fields: ['tenantId', 'sku'], name: 'product_tenant_sku_unique' },
      { fields: ['tenantId', 'status', 'name'] },
      { fields: ['tenantId', 'categoryId'] },
      { fields: ['tenantId', 'barcode'] }
    ]
  });

  const ProductPriceOption = sequelize.define('ProductPriceOption', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenantId: { type: DataTypes.UUID, allowNull: false },
    branchId: { type: DataTypes.UUID, allowNull: false },
    productId: { type: DataTypes.UUID, allowNull: false },
    label: { type: DataTypes.STRING(80), allowNull: false },
    quantityBaseUnits: { type: DataTypes.DECIMAL(18, 3), allowNull: false },
    priceMinor: { type: DataTypes.BIGINT, allowNull: false },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }
  }, {
    tableName: 'product_price_options',
    indexes: [
      { unique: true, fields: ['branchId', 'productId', 'label'], name: 'price_option_branch_product_label_unique' },
      { fields: ['tenantId', 'branchId', 'productId', 'active'] }
    ]
  });

  const Supplier = sequelize.define('Supplier', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenantId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(180), allowNull: false },
    phone: { type: DataTypes.STRING(40), allowNull: true },
    email: { type: DataTypes.STRING(320), allowNull: true },
    gstin: { type: DataTypes.STRING(40), allowNull: true },
    address: { type: DataTypes.TEXT, allowNull: true },
    status: { type: DataTypes.STRING(24), allowNull: false, defaultValue: 'ACTIVE' }
  }, {
    tableName: 'suppliers',
    indexes: [
      { fields: ['tenantId', 'status', 'name'] },
      { fields: ['tenantId', 'gstin'] }
    ]
  });

  const Purchase = sequelize.define('Purchase', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenantId: { type: DataTypes.UUID, allowNull: false },
    branchId: { type: DataTypes.UUID, allowNull: false },
    supplierId: { type: DataTypes.UUID, allowNull: true },
    invoiceNumber: { type: DataTypes.STRING(120), allowNull: true },
    purchaseDate: { type: DataTypes.DATEONLY, allowNull: false },
    status: { type: DataTypes.STRING(24), allowNull: false, defaultValue: 'POSTED' },
    totalMinor: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
    notes: { type: DataTypes.TEXT, allowNull: true },
    idempotencyKey: { type: DataTypes.STRING(180), allowNull: true },
    createdByUserId: { type: DataTypes.UUID, allowNull: false }
  }, {
    tableName: 'purchases',
    indexes: [
      { fields: ['tenantId', 'branchId', 'purchaseDate'] },
      { fields: ['tenantId', 'supplierId', 'purchaseDate'] }
    ]
  });

  const PurchaseLine = sequelize.define('PurchaseLine', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenantId: { type: DataTypes.UUID, allowNull: false },
    branchId: { type: DataTypes.UUID, allowNull: false },
    purchaseId: { type: DataTypes.UUID, allowNull: false },
    productId: { type: DataTypes.UUID, allowNull: false },
    productNameSnapshot: { type: DataTypes.STRING(180), allowNull: false },
    skuSnapshot: { type: DataTypes.STRING(80), allowNull: true },
    packageCount: { type: DataTypes.DECIMAL(18, 3), allowNull: false },
    packageSizeBaseUnits: { type: DataTypes.DECIMAL(18, 3), allowNull: false },
    totalBaseUnits: { type: DataTypes.DECIMAL(18, 3), allowNull: false },
    lineTotalMinor: { type: DataTypes.BIGINT, allowNull: false }
  }, {
    tableName: 'purchase_lines',
    indexes: [
      { fields: ['purchaseId'] },
      { fields: ['tenantId', 'branchId', 'productId'] }
    ]
  });

  const InventoryBalance = sequelize.define('InventoryBalance', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenantId: { type: DataTypes.UUID, allowNull: false },
    branchId: { type: DataTypes.UUID, allowNull: false },
    productId: { type: DataTypes.UUID, allowNull: false },
    quantityBase: { type: DataTypes.DECIMAL(18, 3), allowNull: false, defaultValue: 0 },
    inventoryValueMinor: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
    weightedAverageCostMinorPerUnit: { type: DataTypes.DECIMAL(24, 8), allowNull: false, defaultValue: 0 },
    version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }
  }, {
    tableName: 'inventory_balances',
    indexes: [
      { unique: true, fields: ['tenantId', 'branchId', 'productId'], name: 'inventory_balance_scope_unique' },
      { fields: ['tenantId', 'branchId'] }
    ]
  });

  const InventoryMovement = sequelize.define('InventoryMovement', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenantId: { type: DataTypes.UUID, allowNull: false },
    branchId: { type: DataTypes.UUID, allowNull: false },
    productId: { type: DataTypes.UUID, allowNull: false },
    movementType: { type: DataTypes.STRING(32), allowNull: false },
    quantityDeltaBase: { type: DataTypes.DECIMAL(18, 3), allowNull: false },
    unitCostMinorPerUnit: { type: DataTypes.DECIMAL(24, 8), allowNull: false, defaultValue: 0 },
    costAmountMinor: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
    stockAfterBase: { type: DataTypes.DECIMAL(18, 3), allowNull: false },
    inventoryValueAfterMinor: { type: DataTypes.BIGINT, allowNull: false },
    referenceType: { type: DataTypes.STRING(60), allowNull: true },
    referenceId: { type: DataTypes.STRING(100), allowNull: true },
    reason: { type: DataTypes.TEXT, allowNull: true },
    idempotencyKey: { type: DataTypes.STRING(180), allowNull: true },
    actorUserId: { type: DataTypes.UUID, allowNull: false }
  }, {
    tableName: 'inventory_movements',
    updatedAt: false,
    indexes: [
      { fields: ['tenantId', 'branchId', 'productId', 'createdAt'] },
      { fields: ['tenantId', 'branchId', 'movementType', 'createdAt'] }
    ]
  });

  return {
    ProductCategory,
    Product,
    ProductPriceOption,
    Supplier,
    Purchase,
    PurchaseLine,
    InventoryBalance,
    InventoryMovement
  };
};
