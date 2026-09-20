const assert = require('assert');
const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { sequelize } = require('../src/config/database');
const models = require('../src/models');
const { runSalesMigration } = require('../src/migrations/sales');
const { runRestaurantMigration } = require('../src/migrations/restaurant');
const { runAnalyticsMigration } = require('../src/migrations/analytics');
const { runReportsMigration } = require('../src/migrations/reports');
const { runStocktakeMigration } = require('../src/migrations/stocktake');
const { runOperationalShiftsMigration } = require('../src/migrations/operationalShifts');
const { runSalesRefundsMigration } = require('../src/migrations/salesRefunds');
const { runBranchSettingsMigration } = require('../src/migrations/branchSettings');
const { runDevicesMigration } = require('../src/migrations/devices');
const { runKitchenTicketsMigration } = require('../src/migrations/kitchenTickets');
const { runReservationsMigration } = require('../src/migrations/reservations');
const { runRestaurantEnhancementsMigration } = require('../src/migrations/restaurantEnhancements');
const { runRestaurantNotificationsMigration } = require('../src/migrations/restaurantNotifications');
const { runInventoryOperationsMigration } = require('../src/migrations/inventoryOperations');
const { runGrowthMigration } = require('../src/migrations/growth');
const { runIntegrationsMigration } = require('../src/migrations/integrations');
const { runOperationsMigration } = require('../src/migrations/operations');
const { runEcosystemMigration } = require('../src/migrations/ecosystem');
const { runGuestPaymentsMigration } = require('../src/migrations/guestPayments');
const { RestaurantTable, MenuItem, RecipeComponent, KitchenTicket, KitchenTicketLine, Reservation, RestaurantNotification } = require('../src/models/restaurant');
const { Order, Payment } = require('../src/models/sales');
const { postPurchase, postTransfer } = require('../src/services/inventoryService');
const { createStocktake, updateStocktakeCounts, submitStocktake, postStocktake } = require('../src/services/stocktakeService');
const { openShift, submitShift, approveShift } = require('../src/services/shiftService');
const { postCounterSale, refundPaidOrder } = require('../src/services/salesService');
const { createRestaurantOrder, cancelRestaurantOrder, moveRestaurantOrder, mergeRestaurantOrders, splitRestaurantOrder } = require('../src/services/restaurantService');
const { ensureReservationReminders } = require('../src/services/restaurantNotificationService');
const { dispatchTransfer, receiveTransfer, postSupplierReturn } = require('../src/services/inventoryOperationsService');
const { InventoryBatch } = require('../src/models/inventoryOperations');
const { seedDemoData, DEMO } = require('../src/services/demoSeedService');
const { canManageTenant, hasBranchRole } = require('../src/services/accessService');
const { policyGuard } = require('../src/middleware/routePolicy');
const { responsePolicy } = require('../src/middleware/responsePolicy');
const waiterCatalogue = require('../src/routes/waiterCatalogue');
const cashierSales = require('../src/routes/cashierSales');
const publicRoutes = require('../src/routes/public');
const platformRoutes = require('../src/routes/platform');

const {
  User,
  Tenant,
  TenantMembership,
  Branch,
  BranchMembership,
  Product,
  ProductPriceOption,
  Supplier,
  InventoryBalance
} = models;

async function prepareSchema() {
  await sequelize.authenticate();
  await sequelize.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await models.bootstrapModels();
  await runSalesMigration(sequelize);
  await runRestaurantMigration(sequelize);
  await runAnalyticsMigration(sequelize);
  await runReportsMigration(sequelize);
  await runStocktakeMigration(sequelize);
  await runOperationalShiftsMigration(sequelize);
  await runSalesRefundsMigration(sequelize);
  await runBranchSettingsMigration(sequelize);
  await runDevicesMigration(sequelize);
  await runKitchenTicketsMigration(sequelize);
  await runReservationsMigration(sequelize);
  await runRestaurantEnhancementsMigration(sequelize);
  await runRestaurantNotificationsMigration(sequelize);
  await runInventoryOperationsMigration(sequelize);
  await runGrowthMigration(sequelize);
  await runIntegrationsMigration(sequelize);
  await runOperationsMigration(sequelize);
  await runEcosystemMigration(sequelize);
  await runGuestPaymentsMigration(sequelize);
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

function testToken(user) {
  return jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

function focusedApiApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/public', publicRoutes);
  app.use('/api', policyGuard);
  app.use('/api', responsePolicy);
  app.use('/api/restaurant', waiterCatalogue);
  app.use('/api/sales', cashierSales);
  app.use((req, res) => res.status(404).json({ message: 'Route not mounted in test app.' }));
  app.use((error, _req, res, _next) => res.status(Number(error.status || 500)).json({ message: error.message, code: error.code || 'TEST_ERROR' }));
  return app;
}

function platformApiApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/platform', platformRoutes);
  app.use((req, res) => res.status(404).json({ message: 'Route not mounted in test app.' }));
  app.use((error, _req, res, _next) => res.status(Number(error.status || 500)).json({ message: error.message, code: error.code || 'TEST_ERROR' }));
  return app;
}

function assertNoSensitiveEmployeeFields(body) {
  const payload = JSON.stringify(body);
  for (const key of ['quantityBase', 'inventoryValueMinor', 'cogsMinor', 'grossProfitMinor', 'costAmountMinor', 'averageUnitCostMinor']) {
    assert.ok(!payload.includes(`\"${key}\":`), `response must not contain ${key}`);
  }
}

describe('critical commerce, restaurant and role-isolation flows', function () {
  this.timeout(60000);
  let fixture;

  before(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-that-is-longer-than-thirty-two-characters';
    process.env.SUPER_ADMIN_EMAIL = 'platform-admin@example.com';
    await prepareSchema();
    fixture = await seedBase();
  });
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
    const firstOrder = await createRestaurantOrder({ tenantId: fixture.tenantA.id, branchId: fixture.branchA.id, tableId: table.id, lines: [{ priceOptionId: fixture.price30.id, quantityUnits: 1 }], waiterUserId: fixture.actor.id, actorUserId: fixture.actor.id, idempotencyKey: 'table-first' });
    assert.equal(await KitchenTicket.count({ where: { orderId: firstOrder.order.id, station: 'BAR', status: 'NEW' } }), 1);
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

  it('serves the public menu and accepts one idempotent QR guest-order request', async () => {
    const table = await RestaurantTable.create({ tenantId:fixture.tenantA.id,branchId:fixture.branchA.id,name:'QR Table',code:'QR-1',seats:2,status:'ACTIVE',qrToken:`qr-${crypto.randomUUID()}` });
    const qrProduct = await Product.create({tenantId:fixture.tenantA.id,name:'Guest Menu Item',sku:'QR-GUEST-1',productType:'FOOD',inventoryUnit:'PIECE',trackInventory:false,status:'ACTIVE'});
    const qrPrice = await ProductPriceOption.create({tenantId:fixture.tenantA.id,branchId:fixture.branchA.id,productId:qrProduct.id,label:'Serving',quantityBaseUnits:'1.000',priceMinor:'22000',active:true,sortOrder:0});
    await MenuItem.create({tenantId:fixture.tenantA.id,branchId:fixture.branchA.id,productId:qrProduct.id,displayName:'Guest Menu Item',sectionName:'Food',active:true,sortOrder:0,modifierGroups:[],comboItems:[]});
    const app=focusedApiApp(),menu=await request(app).get(`/api/public/menu/${table.qrToken}`).expect(200);assert.equal(menu.body.table.code,'QR-1');assert.ok(menu.body.menu.length>=1);
    const body={guestName:'Guest',phone:'9000000000',lines:[{priceOptionId:qrPrice.id,quantityUnits:1}],idempotencyKey:'qr-smoke-1'};
    const first=await request(app).post(`/api/public/menu/${table.qrToken}/orders`).send(body).expect(202);const replay=await request(app).post(`/api/public/menu/${table.qrToken}/orders`).send(body).expect(200);assert.equal(first.body.request.id,replay.body.request.id);assert.equal(replay.body.replayed,true);
  });

  it('prices modifiers, records KOT choices, consumes recipe ingredients and reverses them on cancellation', async () => {
    const ingredient = await Product.create({ tenantId: fixture.tenantA.id, name: 'Recipe Ingredient', sku: 'RECIPE-GRAM', productType: 'FOOD', inventoryUnit: 'GRAM', trackInventory: true, status: 'ACTIVE' });
    const dish = await Product.create({ tenantId: fixture.tenantA.id, name: 'Recipe Dish', sku: 'RECIPE-DISH', productType: 'FOOD', inventoryUnit: 'PIECE', trackInventory: false, status: 'ACTIVE' });
    const dishPrice = await ProductPriceOption.create({ tenantId: fixture.tenantA.id, branchId: fixture.branchA.id, productId: dish.id, label: 'Regular', quantityBaseUnits: '1.000', priceMinor: '30000', active: true, sortOrder: 0 });
    await postPurchase({ tenantId: fixture.tenantA.id, branchId: fixture.branchA.id, purchaseDate: new Date().toISOString().slice(0,10), idempotencyKey: 'recipe-opening-stock', lines: [{ productId: ingredient.id, packageCount: '1', packageSizeBaseUnits: '1000', lineTotalMinor: '10000' }], actorUserId: fixture.actor.id });
    const modifierId = crypto.randomUUID();
    await MenuItem.create({
      tenantId: fixture.tenantA.id, branchId: fixture.branchA.id, productId: dish.id,
      displayName: 'Recipe Dish', sectionName: 'Test Kitchen', active: true,
      modifierGroups: [{ id: crypto.randomUUID(), name: 'Add-on', min: 1, max: 1, required: true, options: [{ id: modifierId, label: 'Premium topping', priceMinor: '5000' }] }],
      comboItems: [{ id: crypto.randomUUID(), label: 'Side salad', quantity: 1 }]
    });
    await RecipeComponent.create({ tenantId: fixture.tenantA.id, branchId: fixture.branchA.id, outputProductId: dish.id, priceOptionId: dishPrice.id, ingredientProductId: ingredient.id, quantityBasePerUnit: '50.000', wastePercent: '0.000', active: true });
    const table = await RestaurantTable.create({ tenantId: fixture.tenantA.id, branchId: fixture.branchA.id, name: 'Recipe Table', code: 'RECIPE-T', seats: 2, status: 'ACTIVE', qrToken: crypto.randomBytes(24).toString('base64url') });
    const before = await stockOf(fixture.tenantA.id, fixture.branchA.id, ingredient.id);
    const opened = await createRestaurantOrder({ tenantId: fixture.tenantA.id, branchId: fixture.branchA.id, tableId: table.id, lines: [{ priceOptionId: dishPrice.id, quantityUnits: 1, modifiers: [modifierId], notes: 'Allergy checked' }], waiterUserId: fixture.actor.id, actorUserId: fixture.actor.id, idempotencyKey: 'recipe-order' });
    assert.equal(opened.order.totalMinor, '35000');
    assert.equal(await stockOf(fixture.tenantA.id, fixture.branchA.id, ingredient.id), before - 50);
    const ticketLine = await KitchenTicketLine.findOne({ where: { orderLineId: opened.order.lines[0].id } });
    assert.equal(ticketLine.modifiersSnapshot[0].label, 'Premium topping');
    assert.equal(ticketLine.notes, 'Allergy checked');
    await cancelRestaurantOrder({ orderId: opened.order.id, tenantId: fixture.tenantA.id, branchId: fixture.branchA.id, reason: 'Recipe reversal test', approvedByUserId: fixture.actor.id });
    assert.equal(await stockOf(fixture.tenantA.id, fixture.branchA.id, ingredient.id), before);
  });

  it('creates one deduplicated in-app reminder for an upcoming reservation', async () => {
    const startsAt = new Date(Date.now() + 60 * 60 * 1000);
    const reservation = await Reservation.create({
      tenantId: fixture.tenantA.id,
      branchId: fixture.branchA.id,
      guestName: 'Reminder Guest',
      phone: '+919999999999',
      partySize: 4,
      startsAt,
      durationMinutes: 90,
      status: 'CONFIRMED',
      depositMinor: '50000',
      consentToContact: true,
      createdByUserId: fixture.actor.id
    });
    const first = await ensureReservationReminders(new Date());
    const second = await ensureReservationReminders(new Date());
    assert.ok(first.created >= 1);
    assert.equal(second.created, 0);
    assert.equal(await RestaurantNotification.count({ where: { dedupeKey: `reservation-reminder:${reservation.id}` } }), 1);
  });

  it('splits, merges and moves restaurant bills without changing stock twice', async () => {
    const tables = [];
    for (const [name, code] of [['Split Source', 'SPLIT-A'], ['Split Destination', 'SPLIT-B'], ['Move Destination', 'MOVE-C']]) {
      tables.push(await RestaurantTable.create({ tenantId: fixture.tenantA.id, branchId: fixture.branchA.id, name, code, seats: 4, status: 'ACTIVE', qrToken: crypto.randomBytes(24).toString('base64url') }));
    }
    const opened = await createRestaurantOrder({
      tenantId: fixture.tenantA.id,
      branchId: fixture.branchA.id,
      tableId: tables[0].id,
      lines: [{ priceOptionId: fixture.price30.id, quantityUnits: 2 }],
      waiterUserId: fixture.actor.id,
      actorUserId: fixture.actor.id,
      idempotencyKey: 'split-merge-move-source'
    });
    const stockAfterOpen = await stockOf(fixture.tenantA.id, fixture.branchA.id, fixture.productA.id);
    const split = await splitRestaurantOrder({
      orderId: opened.order.id,
      tenantId: fixture.tenantA.id,
      branchId: fixture.branchA.id,
      destinationTableId: tables[1].id,
      lines: [{ lineId: opened.order.lines[0].id, quantityUnits: 1 }],
      actorUserId: fixture.actor.id,
      idempotencyKey: 'split-once'
    });
    assert.equal(split.order.totalMinor, '22000');
    assert.equal(await stockOf(fixture.tenantA.id, fixture.branchA.id, fixture.productA.id), stockAfterOpen);
    const merged = await mergeRestaurantOrders({
      sourceOrderId: split.order.id,
      targetOrderId: opened.order.id,
      tenantId: fixture.tenantA.id,
      branchId: fixture.branchA.id,
      actorUserId: fixture.actor.id
    });
    assert.equal(merged.totalMinor, '44000');
    assert.equal((await Order.findByPk(split.order.id)).status, 'VOIDED');
    const moved = await moveRestaurantOrder({ orderId: merged.id, tenantId: fixture.tenantA.id, branchId: fixture.branchA.id, destinationTableId: tables[2].id });
    assert.equal(String(moved.tableId), String(tables[2].id));
    assert.equal(await stockOf(fixture.tenantA.id, fixture.branchA.id, fixture.productA.id), stockAfterOpen);
  });

  it('moves stock between branches atomically and replays safely', async () => {
    const destination = await Branch.create({
      tenantId: fixture.tenantA.id,
      name: 'A Wine Shop',
      code: 'A-02',
      type: 'WINE_SHOP',
      status: 'ACTIVE'
    });
    const sourceBefore = await stockOf(fixture.tenantA.id, fixture.branchA.id, fixture.productA.id);
    const destinationBefore = await stockOf(fixture.tenantA.id, destination.id, fixture.productA.id);
    const first = await postTransfer({
      tenantId: fixture.tenantA.id,
      sourceBranchId: fixture.branchA.id,
      destinationBranchId: destination.id,
      productId: fixture.productA.id,
      quantityBase: '750',
      reason: 'Opening stock for second outlet',
      idempotencyKey: 'branch-transfer-once',
      actorUserId: fixture.actor.id
    });
    const replay = await postTransfer({
      tenantId: fixture.tenantA.id,
      sourceBranchId: fixture.branchA.id,
      destinationBranchId: destination.id,
      productId: fixture.productA.id,
      quantityBase: '750',
      reason: 'Opening stock for second outlet',
      idempotencyKey: 'branch-transfer-once',
      actorUserId: fixture.actor.id
    });
    const sourceAfter = await stockOf(fixture.tenantA.id, fixture.branchA.id, fixture.productA.id);
    const destinationAfter = await stockOf(fixture.tenantA.id, destination.id, fixture.productA.id);

    assert.equal(sourceBefore - sourceAfter, 750);
    assert.equal(destinationAfter - destinationBefore, 750);
    assert.equal(first.outgoingMovement.referenceId, first.incomingMovement.referenceId);
    assert.equal(replay.transferId, first.transferId);
    assert.equal(replay.replayed, true);
  });

  it('keeps dispatched stock in transit until the destination receives it', async () => {
    const destination = await Branch.create({ tenantId: fixture.tenantA.id, name: 'Transit Destination', code: 'TRANSIT-01', type: 'WINE_SHOP', status: 'ACTIVE' });
    const sourceBefore = await stockOf(fixture.tenantA.id, fixture.branchA.id, fixture.productA.id);
    const destinationBefore = await stockOf(fixture.tenantA.id, destination.id, fixture.productA.id);
    const dispatched = await dispatchTransfer({ tenantId: fixture.tenantA.id, sourceBranchId: fixture.branchA.id, destinationBranchId: destination.id, lines: [{ productId: fixture.productA.id, quantityBase: '375' }], reason: 'Lifecycle transfer test', idempotencyKey: 'transit-transfer', actorUserId: fixture.actor.id });
    assert.equal(dispatched.transfer.status, 'IN_TRANSIT');
    assert.equal(sourceBefore - await stockOf(fixture.tenantA.id, fixture.branchA.id, fixture.productA.id), 375);
    assert.equal(await stockOf(fixture.tenantA.id, destination.id, fixture.productA.id), destinationBefore);
    const received = await receiveTransfer({ tenantId: fixture.tenantA.id, destinationBranchId: destination.id, transferId: dispatched.transfer.id, actorUserId: fixture.actor.id });
    assert.equal(received.transfer.status, 'RECEIVED');
    assert.equal(await stockOf(fixture.tenantA.id, destination.id, fixture.productA.id) - destinationBefore, 375);
  });

  it('records purchase batch, pack conversion, expiry/MRP and a supplier return', async () => {
    const supplier = await Supplier.create({ tenantId: fixture.tenantA.id, name: 'Batch Supplier', status: 'ACTIVE' });
    const purchase = await postPurchase({ tenantId: fixture.tenantA.id, branchId: fixture.branchA.id, supplierId: supplier.id, purchaseDate: new Date().toISOString().slice(0,10), idempotencyKey: 'batch-purchase', lines: [{ productId: fixture.productA.id, packageCount: '2', packageSizeBaseUnits: '750', lineTotalMinor: '240000', batchNumber: 'BATCH-EXP-01', expiresAt: '2027-12-31', mrpMinor: '180000', packageLabel: 'Case conversion: 2 bottles' }], actorUserId: fixture.actor.id });
    const batch = await InventoryBatch.findOne({ where: { purchaseId: purchase.purchase.id, batchNumber: 'BATCH-EXP-01' } });
    assert.equal(Number(batch.quantityCurrentBase), 1500);
    assert.equal(batch.mrpMinor, '180000');
    const before = await stockOf(fixture.tenantA.id, fixture.branchA.id, fixture.productA.id);
    await postSupplierReturn({ tenantId: fixture.tenantA.id, branchId: fixture.branchA.id, supplierId: supplier.id, productId: fixture.productA.id, batchId: batch.id, quantityBase: '750', creditMinor: '120000', reason: 'Short-dated batch return', idempotencyKey: 'batch-return', actorUserId: fixture.actor.id });
    await batch.reload();
    assert.equal(Number(batch.quantityCurrentBase), 750);
    assert.equal(before - await stockOf(fixture.tenantA.id, fixture.branchA.id, fixture.productA.id), 750);
  });

  it('records mixed tender only when the component payments equal the bill total', async () => {
    const result = await postCounterSale({
      tenantId: fixture.tenantA.id,
      branchId: fixture.branchA.id,
      orderType: 'COUNTER',
      lines: [{ priceOptionId: fixture.price30.id, quantityUnits: 1 }],
      payments: [
        { method: 'CASH', amountMinor: '10000' },
        { method: 'UPI', amountMinor: '12000', reference: 'mixed-payment-test' }
      ],
      idempotencyKey: 'mixed-tender-sale',
      actorUserId: fixture.actor.id
    });
    const payments = await Payment.findAll({ where: { orderId: result.order.id }, order: [['method', 'ASC']] });
    assert.equal(payments.length, 2);
    assert.equal(payments.reduce((sum, payment) => sum + Number(payment.amountMinor), 0), 22000);
    await assert.rejects(
      () => postCounterSale({
        tenantId: fixture.tenantA.id,
        branchId: fixture.branchA.id,
        orderType: 'COUNTER',
        lines: [{ priceOptionId: fixture.price30.id, quantityUnits: 1 }],
        payments: [{ method: 'CARD', amountMinor: '10000' }, { method: 'UPI', amountMinor: '10000' }],
        idempotencyKey: 'bad-mixed-tender-sale',
        actorUserId: fixture.actor.id
      }),
      (error) => error?.code === 'PAYMENT_TOTAL_MISMATCH'
    );
  });

  it('posts an approved physical stocktake once and records the variance', async () => {
    const before = await stockOf(fixture.tenantA.id, fixture.branchA.id, fixture.productA.id);
    const opened = await createStocktake({
      tenantId: fixture.tenantA.id,
      branchId: fixture.branchA.id,
      name: 'Automated closing count',
      actorUserId: fixture.actor.id
    });
    const targetLine = opened.lines.find((line) => String(line.productId) === String(fixture.productA.id));
    assert.ok(targetLine);

    await updateStocktakeCounts({
      tenantId: fixture.tenantA.id,
      branchId: fixture.branchA.id,
      stocktakeId: opened.id,
      counts: opened.lines.map((line) => ({
        lineId: line.id,
        countedQuantityBase: String(line.id) === String(targetLine.id)
          ? String(Number(line.expectedQuantityBase) - 30)
          : line.expectedQuantityBase,
        note: String(line.id) === String(targetLine.id) ? 'Measured one peg short' : null
      }))
    });
    await submitStocktake({
      tenantId: fixture.tenantA.id,
      branchId: fixture.branchA.id,
      stocktakeId: opened.id,
      actorUserId: fixture.actor.id
    });
    const first = await postStocktake({
      tenantId: fixture.tenantA.id,
      branchId: fixture.branchA.id,
      stocktakeId: opened.id,
      actorUserId: fixture.actor.id
    });
    const replay = await postStocktake({
      tenantId: fixture.tenantA.id,
      branchId: fixture.branchA.id,
      stocktakeId: opened.id,
      actorUserId: fixture.actor.id
    });

    assert.equal(first.stocktake.status, 'POSTED');
    assert.equal(Number(first.stocktake.lines.find((line) => String(line.id) === String(targetLine.id)).varianceQuantityBase), -30);
    assert.equal(await stockOf(fixture.tenantA.id, fixture.branchA.id, fixture.productA.id), before - 30);
    assert.equal(replay.replayed, true);
  });

  it('reconciles a cashier shift and requires manager approval before closing', async () => {
    const opened = await openShift({
      tenantId: fixture.tenantA.id,
      branchId: fixture.branchA.id,
      userId: fixture.actor.id,
      role: 'CASHIER',
      openingFloatMinor: '10000',
      idempotencyKey: 'test-cashier-shift'
    });
    await postCounterSale({
      tenantId: fixture.tenantA.id,
      branchId: fixture.branchA.id,
      orderType: 'COUNTER',
      lines: [{ priceOptionId: fixture.price30.id, quantityUnits: 1 }],
      paymentMethod: 'CASH',
      idempotencyKey: 'shift-cash-sale',
      actorUserId: fixture.actor.id
    });
    const submitted = await submitShift({
      tenantId: fixture.tenantA.id,
      branchId: fixture.branchA.id,
      shiftId: opened.shift.id,
      userId: fixture.actor.id,
      declaredCashMinor: '32000',
      closeNote: 'Drawer counted'
    });
    assert.equal(submitted.expectedCashMinor, '32000');
    assert.equal(submitted.varianceMinor, '0');
    const closed = await approveShift({
      tenantId: fixture.tenantA.id,
      branchId: fixture.branchA.id,
      shiftId: submitted.id,
      approvedByUserId: fixture.actor.id
    });
    const replay = await approveShift({
      tenantId: fixture.tenantA.id,
      branchId: fixture.branchA.id,
      shiftId: submitted.id,
      approvedByUserId: fixture.actor.id
    });
    assert.equal(closed.shift.status, 'CLOSED');
    assert.equal(replay.replayed, true);
  });

  it('refunds a paid bill once and restores returned stock atomically', async () => {
    const beforeSale = await stockOf(fixture.tenantA.id, fixture.branchA.id, fixture.productA.id);
    const sale = await postCounterSale({
      tenantId: fixture.tenantA.id,
      branchId: fixture.branchA.id,
      orderType: 'COUNTER',
      lines: [{ priceOptionId: fixture.price30.id, quantityUnits: 2 }],
      paymentMethod: 'UPI',
      idempotencyKey: 'refund-test-sale',
      actorUserId: fixture.actor.id
    });
    assert.equal(await stockOf(fixture.tenantA.id, fixture.branchA.id, fixture.productA.id), beforeSale - 60);
    const first = await refundPaidOrder({
      tenantId: fixture.tenantA.id,
      branchId: fixture.branchA.id,
      orderId: sale.order.id,
      reason: 'Customer returned sealed items',
      stockDisposition: 'RESTOCK',
      refundMethod: 'UPI',
      idempotencyKey: 'refund-test-once',
      actorUserId: fixture.actor.id
    });
    const replay = await refundPaidOrder({
      tenantId: fixture.tenantA.id,
      branchId: fixture.branchA.id,
      orderId: sale.order.id,
      reason: 'Customer returned sealed items',
      stockDisposition: 'RESTOCK',
      refundMethod: 'UPI',
      idempotencyKey: 'refund-test-once',
      actorUserId: fixture.actor.id
    });
    assert.equal(first.order.status, 'REFUNDED');
    assert.equal(await stockOf(fixture.tenantA.id, fixture.branchA.id, fixture.productA.id), beforeSale);
    assert.equal(replay.replayed, true);
  });

  it('rejects cashier-style price overrides unless manager approval is explicit', async () => {
    await assert.rejects(
      () => postCounterSale({
        tenantId: fixture.tenantA.id,
        branchId: fixture.branchA.id,
        orderType: 'COUNTER',
        lines: [{ priceOptionId: fixture.price30.id, quantityUnits: 1, unitPriceMinorOverride: '100', priceOverrideReason: 'Unauthorized change' }],
        paymentMethod: 'UPI',
        idempotencyKey: 'unauthorized-price-override',
        actorUserId: fixture.actor.id
      }),
      (error) => error?.code === 'PRICE_OVERRIDE_DENIED'
    );
  });

  it('does not let Platform Admin inherit Tenant Admin or Branch Manager access', async () => {
    const platformAdmin = await User.create({ email: process.env.SUPER_ADMIN_EMAIL, name: 'Platform Admin', status: 'ACTIVE' });
    assert.equal(await canManageTenant(platformAdmin, fixture.tenantA.id), false);
    assert.equal(await hasBranchRole(platformAdmin, fixture.branchA, ['BRANCH_MANAGER']), false);

    const app = focusedApiApp();
    const response = await request(app)
      .get(`/api/tenants/${fixture.tenantA.id}`)
      .set('Authorization', `Bearer ${testToken(platformAdmin)}`);
    assert.equal(response.status, 403);
    assert.equal(response.body.code, 'PLATFORM_OPERATION_SCOPE_DENIED');
  });

  it('lets Platform Admin rename and archive a business while revoking its access', async () => {
    const [platformAdmin] = await User.findOrCreate({
      where: { email: process.env.SUPER_ADMIN_EMAIL },
      defaults: { name: 'Platform Admin', status: 'ACTIVE' }
    });
    const owner = await User.create({ email: `archive-owner-${crypto.randomUUID()}@example.com`, name: 'Archive Owner', status: 'ACTIVE' });
    const tenant = await Tenant.create({
      name: 'Archive Test Business',
      slug: `archive-test-${crypto.randomBytes(4).toString('hex')}`,
      status: 'ACTIVE',
      createdByUserId: platformAdmin.id
    });
    const branch = await Branch.create({ tenantId: tenant.id, name: 'Archive Branch', code: 'ARCH-01', type: 'BAR_RESTAURANT', status: 'ACTIVE' });
    const tenantMembership = await TenantMembership.create({
      tenantId: tenant.id, userId: owner.id, email: owner.email, role: 'TENANT_ADMIN', status: 'ACTIVE', invitedByUserId: platformAdmin.id, activatedAt: new Date()
    });
    const branchMembership = await BranchMembership.create({
      tenantId: tenant.id, branchId: branch.id, userId: owner.id, email: owner.email, role: 'BRANCH_MANAGER', status: 'ACTIVE', invitedByUserId: platformAdmin.id, activatedAt: new Date()
    });
    const app = platformApiApp();
    const auth = `Bearer ${testToken(platformAdmin)}`;

    await request(app)
      .patch(`/api/platform/tenants/${tenant.id}`)
      .set('Authorization', auth)
      .send({ name: 'Renamed Archive Business' })
      .expect(200);
    await tenant.reload();
    assert.equal(tenant.name, 'Renamed Archive Business');

    await request(app)
      .delete(`/api/platform/tenants/${tenant.id}`)
      .set('Authorization', auth)
      .send({ confirmationName: 'Renamed Archive Business' })
      .expect(200);

    await Promise.all([tenant.reload(), branch.reload(), tenantMembership.reload(), branchMembership.reload()]);
    assert.ok(tenant.deletedAt);
    assert.equal(tenant.status, 'SUSPENDED');
    assert.equal(branch.status, 'SUSPENDED');
    assert.equal(tenantMembership.status, 'SUSPENDED');
    assert.equal(branchMembership.status, 'SUSPENDED');
    const listing = await request(app).get('/api/platform/tenants').set('Authorization', auth).expect(200);
    assert.equal(listing.body.tenants.some((row) => row.id === tenant.id), false);
  });

  it('keeps waiter inside dedicated table-service APIs and published menu only', async () => {
    const waiter = await User.create({ email: 'waiter-policy@example.com', name: 'Policy Waiter', status: 'ACTIVE' });
    await BranchMembership.create({
      tenantId: fixture.tenantA.id,
      branchId: fixture.branchA.id,
      userId: waiter.id,
      email: waiter.email,
      role: 'WAITER',
      status: 'ACTIVE',
      invitedByUserId: fixture.actor.id,
      activatedAt: new Date()
    });

    await MenuItem.create({
      tenantId: fixture.tenantA.id,
      branchId: fixture.branchA.id,
      productId: fixture.productA.id,
      displayName: 'Published Whisky',
      description: 'Visible waiter menu item',
      sectionName: 'Spirits',
      sortOrder: 1,
      featured: false,
      active: true
    });

    const hiddenProduct = await Product.create({
      tenantId: fixture.tenantA.id,
      name: 'Hidden Kitchen Item',
      sku: 'HIDDEN-FOOD-1',
      productType: 'FOOD',
      inventoryUnit: 'PIECE',
      trackInventory: false,
      status: 'ACTIVE'
    });
    await ProductPriceOption.create({
      tenantId: fixture.tenantA.id,
      branchId: fixture.branchA.id,
      productId: hiddenProduct.id,
      label: 'Plate',
      quantityBaseUnits: '1.000',
      priceMinor: '25000',
      active: true,
      sortOrder: 0
    });

    const app = focusedApiApp();
    const auth = `Bearer ${testToken(waiter)}`;

    const inventoryAttempt = await request(app)
      .get(`/api/inventory/tenants/${fixture.tenantA.id}/branches/${fixture.branchA.id}/stock`)
      .set('Authorization', auth);
    assert.equal(inventoryAttempt.status, 403);

    const managerRestaurantAttempt = await request(app)
      .get(`/api/restaurant/tenants/${fixture.tenantA.id}/branches/${fixture.branchA.id}/tables`)
      .set('Authorization', auth);
    assert.equal(managerRestaurantAttempt.status, 403);

    const catalogue = await request(app)
      .get(`/api/restaurant/waiter/tenants/${fixture.tenantA.id}/branches/${fixture.branchA.id}/catalogue`)
      .set('Authorization', auth);
    assert.equal(catalogue.status, 200);
    assert.ok(catalogue.body.products.some((row) => row.name === 'Published Whisky'));
    assert.ok(!catalogue.body.products.some((row) => row.id === hiddenProduct.id));
    assertNoSensitiveEmployeeFields(catalogue.body);
  });

  it('keeps cashier inside dedicated POS namespace and hides inventory/cost fields', async () => {
    const cashier = await User.create({ email: 'cashier-policy@example.com', name: 'Policy Cashier', status: 'ACTIVE' });
    await BranchMembership.create({
      tenantId: fixture.tenantA.id,
      branchId: fixture.branchA.id,
      userId: cashier.id,
      email: cashier.email,
      role: 'CASHIER',
      status: 'ACTIVE',
      invitedByUserId: fixture.actor.id,
      activatedAt: new Date()
    });

    const app = focusedApiApp();
    const auth = `Bearer ${testToken(cashier)}`;

    const managerSalesAttempt = await request(app)
      .get(`/api/sales/tenants/${fixture.tenantA.id}/branches/${fixture.branchA.id}/orders`)
      .set('Authorization', auth);
    assert.equal(managerSalesAttempt.status, 403);

    const catalogue = await request(app)
      .get(`/api/sales/cashier/tenants/${fixture.tenantA.id}/branches/${fixture.branchA.id}/catalogue`)
      .set('Authorization', auth);
    assert.equal(catalogue.status, 200);
    assertNoSensitiveEmployeeFields(catalogue.body);
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
