const assert = require('assert');
const crypto = require('crypto');
const { sequelize } = require('../src/config/database');
const models = require('../src/models');
const { runSalesMigration } = require('../src/migrations/sales');
const { runRestaurantMigration } = require('../src/migrations/restaurant');
const { runAnalyticsMigration } = require('../src/migrations/analytics');
const { runReportsMigration } = require('../src/migrations/reports');
const { RestaurantTable, MenuItem } = require('../src/models/restaurant');
const { Order } = require('../src/models/sales');
const { postPurchase } = require('../src/services/inventoryService');
const { postCounterSale } = require('../src/services/salesService');
const { createRestaurantOrder, cancelRestaurantOrder } = require('../src/services/restaurantService');
const { seedDemoData, DEMO } = require('../src/services/demoSeedService');

const { User, Tenant, TenantMembership, Branch, BranchMembership, Product, ProductPriceOption, InventoryBalance } = models;

async function prepareSchema() {
  await sequelize.authenticate();
  await sequelize.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await models.bootstrapModels();
  await runSalesMigration(sequelize);
  await runRestaurantMigration(sequelize);
  await runAnalyticsMigration(sequelize);
  await runReportsMigration(sequelize);
}

async function seedBase() {
  const actor = await User.create({ email: 'test-owner@example.com', name: 'Test Owner', status: 'ACTIVE' });
  const tenantA = await Tenant.create({ name: 'Tenant A', slug: `tenant-a-${crypto.randomBytes(3).toString('hex')}`, status: 'ACTIVE', createdByUserId: actor.id });
  const tenantB = await Tenant.create({ name: 'Tenant B', slug: `tenant-b-${crypto.randomBytes(3).toString('hex')}`, status: 'ACTIVE', createdByUserId: actor.id });
  const branchA = await Branch.create({ tenantId: tenantA.id, name: 'A Restaurant', code: 'A-01', type: 'BAR_RESTAURANT', status: 'ACTIVE' });
  const branchB = await Branch.create({ tenantId: tenantB.id, name: 'B Shop', code: 'B-01', type: 'WINE_SHOP', status: 'ACTIVE' });
  const productA = await Product.create({ tenantId: tenantA.id, name: 'Test Whisky', sku: 'TW-750', productType: 'ALCOHOL', inventoryUnit: 'ML', bottleVolumeMl: '750.000', trackInventory: true, status: 'ACTIVE' });
  const price30 = await ProductPriceOption.create({ tenantId: tenantA.id, branchId: branchA.id, productId: productA.id, label: '30 ML', quantityBaseUnits: '30.000', priceMinor: '22000', active: true, sortOrder: 0 });
  const priceBottle = await ProductPriceOption.create({ tenantId: tenantA.id, branchId: branchA.id, productId: productA.id, label: 'Full Bottle', quantityBaseUnits: '750.000', priceMinor: '320000', active: true, sortOrder: 1 });
  await postPurchase({ tenantId: tenantA.id, branchId: branchA.id, purchaseDate: new Date().toISOString().slice(0,10), idempotencyKey: 'test-opening-stock', lines: [{ productId: productA.id, packageCount: '10', packageSizeBaseUnits: '750', lineTotalMinor: '1200000' }], actorUserId: actor.id });
  return { actor, tenantA, tenantB, branchA, branchB, productA, price30, priceBottle };
}

async function stockOf(tenantId, branchId, productId) {
  const row = await InventoryBalance.findOne({ where: { tenantId, branchId, productId } });
  return Number(row?.quantityBase || 0);
}

describe('critical commerce and restaurant flows', function () {
  this.timeout(60000);
  let fixture;

  before(async () => { await prepareSchema(); fixture = await seedBase(); });
  after(async () => { await sequelize.close(); });

  it('rejects a cross-tenant price option sale', async () => {
    await assert.rejects(
      () => postCounterSale({ tenantId: fixture.tenantB.id, branchId: fixture.branchB.id, orderType: 'WINE_SHOP', lines: [{ priceOptionId: fixture.price30.id, quantityUnits: 1 }], paymentMethod: 'CASH', idempotencyKey: 'cross-tenant-attempt', actorUserId: fixture.actor.id }),
      /price option is unavailable/i
    );
  });

  it('deducts exact ML once and replays an idempotent sale without double deduction', async () => {
    const before = await stockOf(fixture.tenantA.id, fixture.branchA.id, fixture.productA.id);
    const first = await postCounterSale({ tenantId: fixture.tenantA.id, branchId: fixture.branchA.id, orderType: 'COUNTER', lines: [{ priceOptionId: fixture.price30.id, quantityUnits: 2 }], paymentMethod: 'UPI', idempotencyKey: 'same-checkout', actorUserId: fixture.actor.id });
    const afterFirst = await stockOf(fixture.tenantA.id, fixture.branchA.id, fixture.productA.id);
    const replay = await postCounterSale({ tenantId: fixture.tenantA.id, branchId: fixture.branchA.id, orderType: 'COUNTER', lines: [{ priceOptionId: fixture.price30.id, quantityUnits: 2 }], paymentMethod: 'UPI', idempotencyKey: 'same-checkout', actorUserId: fixture.actor.id });
    const afterReplay = await stockOf(fixture.tenantA.id, fixture.branchA.id, fixture.productA.id);
    assert.equal(before - afterFirst, 60);
    assert.equal(afterReplay, afterFirst);
    assert.equal(String(replay.order.id), String(first.order.id));
    assert.equal(replay.replayed, true);
  });

  it('prevents a second unresolved order on the same table', async () => {
    const table = await RestaurantTable.create({ tenantId: fixture.tenantA.id, branchId: fixture.branchA.id, name: 'Test Table 1', code: 'TT1', seats: 4, status: 'ACTIVE', qrToken: crypto.randomBytes(24).toString('base64url') });
    await createRestaurantOrder({ tenantId: fixture.tenantA.id, branchId: fixture.branchA.id, tableId: table.id, lines: [{ priceOptionId: fixture.price30.id, quantityUnits: 1 }], waiterUserId: fixture.actor.id, actorUserId: fixture.actor.id, idempotencyKey: 'table-first' });
    await assert.rejects(
      () => createRestaurantOrder({ tenantId: fixture.tenantA.id, branchId: fixture.branchA.id, tableId: table.id, lines: [{ priceOptionId: fixture.price30.id, quantityUnits: 1 }], waiterUserId: fixture.actor.id, actorUserId: fixture.actor.id, idempotencyKey: 'table-second' }),
      (error) => error?.code === 'TABLE_OCCUPIED'
    );
  });

  it('restores deducted stock after a manager-approved restaurant cancellation', async () => {
    const table = await RestaurantTable.create({ tenantId: fixture.tenantA.id, branchId: fixture.branchA.id, name: 'Test Table 2', code: 'TT2', seats: 2, status: 'ACTIVE', qrToken: crypto.randomBytes(24).toString('base64url') });
    const before = await stockOf(fixture.tenantA.id, fixture.branchA.id, fixture.productA.id);
    const opened = await createRestaurantOrder({ tenantId: fixture.tenantA.id, branchId: fixture.branchA.id, tableId: table.id, lines: [{ priceOptionId: fixture.price30.id, quantityUnits: 3 }], waiterUserId: fixture.actor.id, actorUserId: fixture.actor.id, idempotencyKey: 'cancel-me' });
    const afterOpen = await stockOf(fixture.tenantA.id, fixture.branchA.id, fixture.productA.id);
    assert.equal(before - afterOpen, 90);
    await cancelRestaurantOrder({ orderId: opened.order.id, tenantId: fixture.tenantA.id, branchId: fixture.branchA.id, reason: 'Automated cancellation test', approvedByUserId: fixture.actor.id });
    const afterCancel = await stockOf(fixture.tenantA.id, fixture.branchA.id, fixture.productA.id);
    assert.equal(afterCancel, before);
  });

  it('creates the requested demo tenant, manager, waiter, food menu and remains idempotent', async () => {
    process.env.DEMO_SEED_ENABLED = 'true';
    const first = await seedDemoData();
    const tenant = await Tenant.findOne({ where: { slug: DEMO.tenantSlug } });
    assert.ok(tenant);
    const ownerMembership = await TenantMembership.findOne({ where: { tenantId: tenant.id, email: DEMO.ownerEmail, role: 'TENANT_ADMIN', status: 'ACTIVE' } });
    assert.ok(ownerMembership);
    const restaurant = await Branch.findOne({ where: { tenantId: tenant.id, code: 'DEMO-RST' } });
    const wineShop = await Branch.findOne({ where: { tenantId: tenant.id, code: 'DEMO-WS' } });
    assert.equal(restaurant.type, 'BAR_RESTAURANT');
    assert.equal(wineShop.type, 'WINE_SHOP');
    assert.ok(await BranchMembership.findOne({ where: { branchId: restaurant.id, email: DEMO.managerEmail, role: 'BRANCH_MANAGER', status: 'ACTIVE' } }));
    assert.ok(await BranchMembership.findOne({ where: { branchId: restaurant.id, email: DEMO.waiterEmail, role: 'WAITER', status: 'ACTIVE' } }));
    const foodCount = await Product.count({ where: { tenantId: tenant.id, productType: 'FOOD' } });
    const menuCount = await MenuItem.count({ where: { tenantId: tenant.id, branchId: restaurant.id, active: true } });
    assert.ok(foodCount >= 15, `expected food dummy data, found ${foodCount}`);
    assert.ok(menuCount >= 20, `expected full dummy menu, found ${menuCount}`);
    const orderCountBefore = await Order.count({ where: { tenantId: tenant.id } });
    const second = await seedDemoData();
    const orderCountAfter = await Order.count({ where: { tenantId: tenant.id } });
    assert.equal(first.tenantId, second.tenantId);
    assert.equal(orderCountAfter, orderCountBefore);
  });
});
