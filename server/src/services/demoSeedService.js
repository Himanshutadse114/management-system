const crypto = require('crypto');
const { sequelize } = require('../config/database');
const {
  User, AccessRequest, Tenant, TenantMembership, Branch, BranchMembership,
  ProductCategory, Product, ProductPriceOption, Supplier, Purchase, InventoryMovement
} = require('../models');
const { RestaurantTable, MenuItem } = require('../models/restaurant');
const { Order } = require('../models/sales');
const { postPurchase, postAdjustment } = require('./inventoryService');
const { postCounterSale } = require('./salesService');
const { createRestaurantOrder, setRestaurantStatus, payRestaurantOrder, cancelRestaurantOrder } = require('./restaurantService');

const DEMO = Object.freeze({
  ownerEmail: 'himanshutadse1272@gmail.com',
  managerEmail: 'cybetantforum@gmail.com',
  waiterEmail: 'tadsehimanshu127@gmail.com',
  tenantSlug: 'demo-hospitality-group',
  tenantName: 'Demo Hospitality Group'
});

function daysAgo(days) {
  const date = new Date(Date.now() - Number(days) * 86400000);
  return date;
}
function dateOnly(days) { return daysAgo(days).toISOString().slice(0, 10); }
function stableUuid(key) {
  const hex = crypto.createHash('sha256').update(`outlet-os-demo:${key}`).digest('hex').slice(0, 32);
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
function stableToken(key) { return crypto.createHash('sha256').update(`outlet-os-qr:${key}`).digest('base64url').slice(0, 32); }

async function ensureUser(email, name) {
  const normalized = email.toLowerCase();
  const [user] = await User.findOrCreate({ where: { email: normalized }, defaults: { email: normalized, name, status: 'ACTIVE' } });
  let changed = false;
  if (!user.name) { user.name = name; changed = true; }
  if (user.status !== 'ACTIVE') { user.status = 'ACTIVE'; changed = true; }
  if (changed) await user.save();
  await AccessRequest.update({ status: 'APPROVED', reviewedAt: new Date() }, { where: { email: normalized } });
  return user;
}

async function ensureTenantMembership(tenant, user, inviter) {
  const [membership] = await TenantMembership.findOrCreate({
    where: { tenantId: tenant.id, email: user.email },
    defaults: { tenantId: tenant.id, userId: user.id, email: user.email, role: 'TENANT_ADMIN', status: 'ACTIVE', invitedByUserId: inviter.id, activatedAt: new Date() }
  });
  membership.userId = user.id; membership.role = 'TENANT_ADMIN'; membership.status = 'ACTIVE'; membership.activatedAt = membership.activatedAt || new Date();
  await membership.save();
  return membership;
}

async function ensureBranchMembership({ tenant, branch, user, role, inviter }) {
  const [membership] = await BranchMembership.findOrCreate({
    where: { branchId: branch.id, email: user.email, role },
    defaults: { tenantId: tenant.id, branchId: branch.id, userId: user.id, email: user.email, role, status: 'ACTIVE', invitedByUserId: inviter.id, activatedAt: new Date() }
  });
  membership.userId = user.id; membership.status = 'ACTIVE'; membership.activatedAt = membership.activatedAt || new Date();
  await membership.save();
  return membership;
}

async function ensureCategory(tenantId, name, sortOrder) {
  const [category] = await ProductCategory.findOrCreate({ where: { tenantId, name }, defaults: { tenantId, name, sortOrder, status: 'ACTIVE' } });
  if (category.status !== 'ACTIVE' || category.sortOrder !== sortOrder) { category.status = 'ACTIVE'; category.sortOrder = sortOrder; await category.save(); }
  return category;
}

async function ensureProduct({ tenantId, categoryId, sku, name, brand = null, productType, inventoryUnit, bottleVolumeMl = null, trackInventory = true }) {
  const [product] = await Product.findOrCreate({
    where: { tenantId, sku },
    defaults: { tenantId, categoryId, sku, name, brand, productType, inventoryUnit, bottleVolumeMl, trackInventory, status: 'ACTIVE' }
  });
  Object.assign(product, { categoryId, name, brand, productType, inventoryUnit, bottleVolumeMl, trackInventory, status: 'ACTIVE' });
  await product.save();
  return product;
}

async function ensurePrice({ tenantId, branchId, productId, label, quantityBaseUnits, priceMinor, sortOrder = 0 }) {
  const [price] = await ProductPriceOption.findOrCreate({
    where: { branchId, productId, label },
    defaults: { tenantId, branchId, productId, label, quantityBaseUnits, priceMinor: String(priceMinor), active: true, sortOrder }
  });
  price.quantityBaseUnits = Number(quantityBaseUnits).toFixed(3); price.priceMinor = String(priceMinor); price.active = true; price.sortOrder = sortOrder; await price.save();
  return price;
}

async function backdateOrder(orderId, days) {
  const timestamp = daysAgo(days);
  await sequelize.query(`UPDATE orders SET "createdAt"=:timestamp, "updatedAt"=:timestamp, "acceptedAt"=COALESCE("acceptedAt",:timestamp), "paidAt"=CASE WHEN status='PAID' THEN :timestamp ELSE "paidAt" END WHERE id=:orderId`, { replacements: { timestamp, orderId } });
  await sequelize.query(`UPDATE order_lines SET "createdAt"=:timestamp, "updatedAt"=:timestamp WHERE "orderId"=:orderId`, { replacements: { timestamp, orderId } });
  await sequelize.query(`UPDATE payments SET "createdAt"=:timestamp, "updatedAt"=:timestamp WHERE "orderId"=:orderId`, { replacements: { timestamp, orderId } });
}

async function seedDemoData() {
  if (String(process.env.DEMO_SEED_ENABLED || 'true').toLowerCase() === 'false') {
    console.log('[demo] demo seed disabled');
    return null;
  }

  const owner = await ensureUser(DEMO.ownerEmail, 'Himanshu Demo Owner');
  const manager = await ensureUser(DEMO.managerEmail, 'Demo Branch Manager');
  const waiter = await ensureUser(DEMO.waiterEmail, 'Demo Waiter');

  const [tenant] = await Tenant.findOrCreate({
    where: { slug: DEMO.tenantSlug },
    defaults: { name: DEMO.tenantName, slug: DEMO.tenantSlug, status: 'ACTIVE', createdByUserId: owner.id }
  });
  if (tenant.status !== 'ACTIVE' || tenant.name !== DEMO.tenantName) { tenant.status = 'ACTIVE'; tenant.name = DEMO.tenantName; await tenant.save(); }
  await ensureTenantMembership(tenant, owner, owner);

  const [restaurant] = await Branch.findOrCreate({ where: { tenantId: tenant.id, code: 'DEMO-RST' }, defaults: { tenantId: tenant.id, name: 'Demo Social Bar & Kitchen', code: 'DEMO-RST', type: 'BAR_RESTAURANT', status: 'ACTIVE', address: '24 Demo Avenue, Pune, Maharashtra', phone: '+91 90000 10001', timezone: 'Asia/Kolkata', currency: 'INR' } });
  Object.assign(restaurant, { name: 'Demo Social Bar & Kitchen', type: 'BAR_RESTAURANT', status: 'ACTIVE', address: '24 Demo Avenue, Pune, Maharashtra', phone: '+91 90000 10001' }); await restaurant.save();
  const [wineShop] = await Branch.findOrCreate({ where: { tenantId: tenant.id, code: 'DEMO-WS' }, defaults: { tenantId: tenant.id, name: 'Demo Cellars Wine Shop', code: 'DEMO-WS', type: 'WINE_SHOP', status: 'ACTIVE', address: 'Shop 3, Demo Avenue, Pune, Maharashtra', phone: '+91 90000 10002', timezone: 'Asia/Kolkata', currency: 'INR' } });
  Object.assign(wineShop, { name: 'Demo Cellars Wine Shop', type: 'WINE_SHOP', status: 'ACTIVE', address: 'Shop 3, Demo Avenue, Pune, Maharashtra', phone: '+91 90000 10002' }); await wineShop.save();

  await ensureBranchMembership({ tenant, branch: restaurant, user: manager, role: 'BRANCH_MANAGER', inviter: owner });
  await ensureBranchMembership({ tenant, branch: wineShop, user: manager, role: 'BRANCH_MANAGER', inviter: owner });
  await ensureBranchMembership({ tenant, branch: restaurant, user: waiter, role: 'WAITER', inviter: owner });

  const categoryNames = ['Spirits','Beer & Wine','Starters','Main Course','Rice & Biryani','Breads','Bar Snacks','Mocktails & Beverages','Desserts'];
  const categories = {};
  for (const [index, name] of categoryNames.entries()) categories[name] = await ensureCategory(tenant.id, name, index + 1);

  const alcoholDefs = [
    { sku:'DEMO-WHISKY-750', name:'Royal Oak Reserve Whisky', brand:'Royal Oak', category:'Spirits', bottle:750, cost:135000, restaurant:[['30 ML',30,22000],['60 ML',60,41000],['90 ML',90,59000],['Full Bottle',750,285000]], shop:[['Full Bottle',750,235000]] },
    { sku:'DEMO-GIN-750', name:'Coastal Dry Gin', brand:'Coastal', category:'Spirits', bottle:750, cost:110000, restaurant:[['30 ML',30,19000],['60 ML',60,35000],['90 ML',90,50000],['Full Bottle',750,240000]], shop:[['Full Bottle',750,195000]] },
    { sku:'DEMO-BEER-650', name:'Premium Lager Beer', brand:'Demo Brew', category:'Beer & Wine', bottle:650, cost:14000, restaurant:[['Bottle 650 ML',650,26000]], shop:[['Bottle 650 ML',650,18000]] },
    { sku:'DEMO-WINE-750', name:'Reserve Red Wine', brand:'Valley Vineyards', category:'Beer & Wine', bottle:750, cost:65000, restaurant:[['Glass 150 ML',150,32000],['Full Bottle',750,140000]], shop:[['Full Bottle',750,95000]] }
  ];
  const foodDefs = [
    { sku:'DEMO-PANEER-TIKKA', name:'Tandoori Paneer Tikka', category:'Starters', section:'Starters', price:32000, cost:14000, label:'Plate', description:'Char-grilled cottage cheese with peppers, onion and mint chutney.', tags:['Vegetarian'], featured:true },
    { sku:'DEMO-CHICKEN-TIKKA', name:'Classic Chicken Tikka', category:'Starters', section:'Starters', price:38000, cost:17500, label:'Plate', description:'Yoghurt-marinated chicken finished in the tandoor with smoky spices.', tags:['Non-Vegetarian'], featured:true },
    { sku:'DEMO-CRISPY-CORN', name:'Crispy Chilli Corn', category:'Starters', section:'Starters', price:26000, cost:8500, label:'Plate', description:'Crispy sweet corn tossed with chilli, spring onion and house seasoning.', tags:['Vegetarian'] },
    { sku:'DEMO-FRIES', name:'Peri Peri French Fries', category:'Starters', section:'Starters', price:18000, cost:5500, label:'Plate', description:'Golden fries dusted with peri peri spice and served with dip.', tags:['Vegetarian'] },
    { sku:'DEMO-BUTTER-CHICKEN', name:'Old Delhi Butter Chicken', category:'Main Course', section:'Main Course', price:46000, cost:21500, label:'Portion', description:'Tandoori chicken simmered in a rich tomato, butter and cream gravy.', tags:['Non-Vegetarian'], featured:true },
    { sku:'DEMO-PANEER-BUTTER', name:'Paneer Butter Masala', category:'Main Course', section:'Main Course', price:36000, cost:14500, label:'Portion', description:'Cottage cheese in a smooth tomato-cashew gravy finished with butter.', tags:['Vegetarian'] },
    { sku:'DEMO-DAL-TADKA', name:'Yellow Dal Tadka', category:'Main Course', section:'Main Course', price:26000, cost:7500, label:'Portion', description:'Slow-cooked yellow lentils tempered with garlic, cumin and chilli.', tags:['Vegetarian'] },
    { sku:'DEMO-CHICKEN-BIRYANI', name:'Hyderabadi Chicken Biryani', category:'Rice & Biryani', section:'Rice & Biryani', price:42000, cost:18500, label:'Bowl', description:'Fragrant basmati rice layered with spiced chicken, herbs and saffron.', tags:['Non-Vegetarian'], featured:true },
    { sku:'DEMO-VEG-BIRYANI', name:'Garden Vegetable Biryani', category:'Rice & Biryani', section:'Rice & Biryani', price:32000, cost:10500, label:'Bowl', description:'Basmati rice cooked dum-style with seasonal vegetables and aromatic spices.', tags:['Vegetarian'] },
    { sku:'DEMO-JEERA-RICE', name:'Jeera Rice', category:'Rice & Biryani', section:'Rice & Biryani', price:22000, cost:5500, label:'Bowl', description:'Steamed basmati rice tossed with roasted cumin and ghee.', tags:['Vegetarian'] },
    { sku:'DEMO-BUTTER-NAAN', name:'Butter Naan', category:'Breads', section:'Breads', price:9000, cost:2200, label:'Piece', description:'Soft tandoor-baked naan brushed with butter.', tags:['Vegetarian'] },
    { sku:'DEMO-TANDOORI-ROTI', name:'Tandoori Roti', category:'Breads', section:'Breads', price:5500, cost:1300, label:'Piece', description:'Whole-wheat flatbread baked fresh in the tandoor.', tags:['Vegetarian'] },
    { sku:'DEMO-MASALA-PEANUTS', name:'Masala Peanuts', category:'Bar Snacks', section:'Bar Snacks', price:16000, cost:4500, label:'Bowl', description:'Roasted peanuts tossed with onion, tomato, coriander and lime.', tags:['Vegetarian'] },
    { sku:'DEMO-CHICKEN-WINGS', name:'Smoky BBQ Chicken Wings', category:'Bar Snacks', section:'Bar Snacks', price:34000, cost:14500, label:'Plate', description:'Juicy wings glazed in smoky barbecue sauce with a mild chilli kick.', tags:['Non-Vegetarian'] },
    { sku:'DEMO-MOJITO', name:'Virgin Mojito', category:'Mocktails & Beverages', section:'Mocktails & Beverages', price:22000, cost:5500, label:'Glass', description:'Fresh mint, lime, sugar and soda over crushed ice.', tags:['Non-Alcoholic'], featured:true, productType:'MIXER' },
    { sku:'DEMO-LIME-SODA', name:'Fresh Lime Soda', category:'Mocktails & Beverages', section:'Mocktails & Beverages', price:14000, cost:3000, label:'Glass', description:'Fresh lime served sweet, salted or mixed with chilled soda.', tags:['Non-Alcoholic'], productType:'MIXER' },
    { sku:'DEMO-COLA', name:'Chilled Cola', category:'Mocktails & Beverages', section:'Mocktails & Beverages', price:9000, cost:4000, label:'Bottle', description:'Chilled carbonated cola served with ice and lemon.', tags:['Non-Alcoholic'], productType:'MIXER' },
    { sku:'DEMO-GULAB-JAMUN', name:'Warm Gulab Jamun', category:'Desserts', section:'Desserts', price:16000, cost:4500, label:'Serving', description:'Warm milk-solid dumplings soaked in cardamom and rose syrup.', tags:['Vegetarian'] },
    { sku:'DEMO-BROWNIE', name:'Chocolate Brownie with Ice Cream', category:'Desserts', section:'Desserts', price:24000, cost:8500, label:'Serving', description:'Warm chocolate brownie topped with vanilla ice cream and chocolate sauce.', tags:['Vegetarian'], featured:true }
  ];

  const products = new Map();
  const prices = new Map();
  for (const def of alcoholDefs) {
    const product = await ensureProduct({ tenantId:tenant.id, categoryId:categories[def.category].id, sku:def.sku, name:def.name, brand:def.brand, productType:'ALCOHOL', inventoryUnit:'ML', bottleVolumeMl:String(def.bottle), trackInventory:true });
    products.set(def.sku, product);
    for (const [index, [label, qty, priceMinor]] of def.restaurant.entries()) prices.set(`${restaurant.code}:${def.sku}:${label}`, await ensurePrice({ tenantId:tenant.id, branchId:restaurant.id, productId:product.id, label, quantityBaseUnits:qty, priceMinor, sortOrder:index }));
    for (const [index, [label, qty, priceMinor]] of def.shop.entries()) prices.set(`${wineShop.code}:${def.sku}:${label}`, await ensurePrice({ tenantId:tenant.id, branchId:wineShop.id, productId:product.id, label, quantityBaseUnits:qty, priceMinor, sortOrder:index }));
  }
  for (const def of foodDefs) {
    const product = await ensureProduct({ tenantId:tenant.id, categoryId:categories[def.category].id, sku:def.sku, name:def.name, productType:def.productType || 'FOOD', inventoryUnit:'PIECE', trackInventory:true });
    products.set(def.sku, product);
    prices.set(`${restaurant.code}:${def.sku}:${def.label}`, await ensurePrice({ tenantId:tenant.id, branchId:restaurant.id, productId:product.id, label:def.label, quantityBaseUnits:1, priceMinor:def.price, sortOrder:0 }));
  }

  const [beverageSupplier] = await Supplier.findOrCreate({ where:{ tenantId:tenant.id, name:'Demo Beverage Distributors' }, defaults:{ tenantId:tenant.id, name:'Demo Beverage Distributors', phone:'+91 90000 20001', email:'sales@demo-beverages.example', gstin:'27ABCDE1234F1Z5', address:'Pune, Maharashtra', status:'ACTIVE' } });
  const [kitchenSupplier] = await Supplier.findOrCreate({ where:{ tenantId:tenant.id, name:'Demo Fresh Foods Supply' }, defaults:{ tenantId:tenant.id, name:'Demo Fresh Foods Supply', phone:'+91 90000 20002', email:'orders@demo-fresh.example', gstin:'27ABCDE5678G1Z2', address:'Pune, Maharashtra', status:'ACTIVE' } });

  await postPurchase({ tenantId:tenant.id, branchId:restaurant.id, supplierId:beverageSupplier.id, invoiceNumber:'DEMO-BEV-RST-001', purchaseDate:dateOnly(12), idempotencyKey:'demo:purchase:restaurant:beverage:v1', actorUserId:manager.id, lines:alcoholDefs.map((def)=>({ productId:products.get(def.sku).id, packageCount:def.sku.includes('BEER')?'36':'15', packageSizeBaseUnits:String(def.bottle), lineTotalMinor:String(def.cost * (def.sku.includes('BEER')?36:15)) })) });
  await postPurchase({ tenantId:tenant.id, branchId:wineShop.id, supplierId:beverageSupplier.id, invoiceNumber:'DEMO-BEV-WS-001', purchaseDate:dateOnly(11), idempotencyKey:'demo:purchase:wineshop:beverage:v1', actorUserId:manager.id, lines:alcoholDefs.map((def)=>({ productId:products.get(def.sku).id, packageCount:def.sku.includes('BEER')?'72':'30', packageSizeBaseUnits:String(def.bottle), lineTotalMinor:String(def.cost * (def.sku.includes('BEER')?72:30)) })) });
  await postPurchase({ tenantId:tenant.id, branchId:restaurant.id, supplierId:kitchenSupplier.id, invoiceNumber:'DEMO-KITCHEN-001', purchaseDate:dateOnly(8), idempotencyKey:'demo:purchase:restaurant:food:v1', actorUserId:manager.id, lines:foodDefs.map((def)=>({ productId:products.get(def.sku).id, packageCount:'50', packageSizeBaseUnits:'1', lineTotalMinor:String(def.cost * 50) })) });

  const tables=[];
  for(let i=1;i<=6;i++){
    const code=`T${String(i).padStart(2,'0')}`;
    const [table]=await RestaurantTable.findOrCreate({ where:{ branchId:restaurant.id, code }, defaults:{ tenantId:tenant.id, branchId:restaurant.id, name:`Table ${String(i).padStart(2,'0')}`, code, seats:i<=2?2:i<=5?4:6, status:'ACTIVE', qrToken:stableToken(`${restaurant.id}:${code}`) } });
    tables.push(table);
  }

  const menuDefs = [
    ...alcoholDefs.map((def,index)=>({ sku:def.sku, section:def.category==='Spirits'?'Whisky & Spirits':'Beer & Wine', description:`${def.brand} · served at current outlet prices.`, tags:['Alcohol'], featured:index===0 })),
    ...foodDefs.map((def)=>({ sku:def.sku, section:def.section, description:def.description, tags:def.tags, featured:Boolean(def.featured) }))
  ];
  for (const [index, def] of menuDefs.entries()) {
    const product=products.get(def.sku);
    const [item]=await MenuItem.findOrCreate({ where:{ branchId:restaurant.id, productId:product.id }, defaults:{ tenantId:tenant.id, branchId:restaurant.id, productId:product.id, displayName:product.name, description:def.description, sectionName:def.section, sortOrder:index, featured:def.featured, active:true, dietaryTags:def.tags } });
    Object.assign(item,{ displayName:product.name, description:def.description, sectionName:def.section, sortOrder:index, featured:def.featured, active:true, dietaryTags:def.tags }); await item.save();
  }

  const getPrice=(branchCode,sku,label)=>{const row=prices.get(`${branchCode}:${sku}:${label}`);if(!row)throw new Error(`Missing demo price ${branchCode}:${sku}:${label}`);return row;};

  const counterSales=[
    { days:6,key:'demo:shop:sale:1',lines:[['DEMO-WHISKY-750','Full Bottle',1]],method:'CARD' },
    { days:5,key:'demo:shop:sale:2',lines:[['DEMO-GIN-750','Full Bottle',1],['DEMO-BEER-650','Bottle 650 ML',2]],method:'UPI' },
    { days:4,key:'demo:shop:sale:3',lines:[['DEMO-WINE-750','Full Bottle',2]],method:'CASH' },
    { days:3,key:'demo:shop:sale:4',lines:[['DEMO-BEER-650','Bottle 650 ML',6]],method:'UPI' },
    { days:1,key:'demo:shop:sale:5',lines:[['DEMO-WHISKY-750','Full Bottle',1],['DEMO-WINE-750','Full Bottle',1]],method:'CARD' }
  ];
  for(const sale of counterSales){
    const result=await postCounterSale({ tenantId:tenant.id, branchId:wineShop.id, orderType:'WINE_SHOP', lines:sale.lines.map(([sku,label,quantityUnits])=>({ priceOptionId:getPrice(wineShop.code,sku,label).id, quantityUnits })), paymentMethod:sale.method, idempotencyKey:sale.key, notes:'Demo wine-shop sale', actorUserId:manager.id });
    if(!result.replayed) await backdateOrder(result.order.id,sale.days);
  }

  const restaurantPaid=[
    { days:5,key:'demo:restaurant:paid:1',table:tables[0],lines:[['DEMO-WHISKY-750','60 ML',1],['DEMO-PANEER-TIKKA','Plate',1],['DEMO-BUTTER-NAAN','Piece',2]],method:'UPI' },
    { days:3,key:'demo:restaurant:paid:2',table:tables[1],lines:[['DEMO-BEER-650','Bottle 650 ML',2],['DEMO-CHICKEN-BIRYANI','Bowl',1],['DEMO-GULAB-JAMUN','Serving',1]],method:'CARD' },
    { days:1,key:'demo:restaurant:paid:3',table:tables[4],lines:[['DEMO-GIN-750','30 ML',2],['DEMO-CHICKEN-TIKKA','Plate',1],['DEMO-DAL-TADKA','Portion',1],['DEMO-JEERA-RICE','Bowl',1]],method:'CASH' }
  ];
  for(const sale of restaurantPaid){
    const opened=await createRestaurantOrder({ tenantId:tenant.id, branchId:restaurant.id, tableId:sale.table.id, lines:sale.lines.map(([sku,label,quantityUnits])=>({ priceOptionId:getPrice(restaurant.code,sku,label).id, quantityUnits })), waiterUserId:waiter.id, actorUserId:waiter.id, notes:'Demo table order', idempotencyKey:sale.key });
    let order=opened.order;
    if(order.status!=='PAID') order=await payRestaurantOrder({ orderId:order.id, tenantId:tenant.id, branchId:restaurant.id, paymentMethod:sale.method, paymentReference:`DEMO-${sale.method}`, actorUserId:waiter.id });
    if(!opened.replayed) await backdateOrder(order.id,sale.days);
  }

  const unresolvedOpen=await createRestaurantOrder({ tenantId:tenant.id, branchId:restaurant.id, tableId:tables[2].id, lines:[['DEMO-MOJITO','Glass',2],['DEMO-CRISPY-CORN','Plate',1]].map(([sku,label,quantityUnits])=>({ priceOptionId:getPrice(restaurant.code,sku,label).id, quantityUnits })), waiterUserId:waiter.id, actorUserId:waiter.id, notes:'Demo unresolved order for reconciliation', idempotencyKey:'demo:restaurant:open:1' });
  if(!unresolvedOpen.replayed) await backdateOrder(unresolvedOpen.order.id,0);

  const unresolvedPay=await createRestaurantOrder({ tenantId:tenant.id, branchId:restaurant.id, tableId:tables[3].id, lines:[['DEMO-WHISKY-750','30 ML',1],['DEMO-CHICKEN-WINGS','Plate',1],['DEMO-LIME-SODA','Glass',1]].map(([sku,label,quantityUnits])=>({ priceOptionId:getPrice(restaurant.code,sku,label).id, quantityUnits })), waiterUserId:waiter.id, actorUserId:waiter.id, notes:'Demo awaiting-payment order', idempotencyKey:'demo:restaurant:awaiting:1' });
  if(unresolvedPay.order.status==='OPEN') await setRestaurantStatus({ orderId:unresolvedPay.order.id, tenantId:tenant.id, branchId:restaurant.id, nextStatus:'AWAITING_PAYMENT' });
  if(!unresolvedPay.replayed) await backdateOrder(unresolvedPay.order.id,0);

  const cancelled=await createRestaurantOrder({ tenantId:tenant.id, branchId:restaurant.id, tableId:tables[5].id, lines:[['DEMO-WINE-750','Glass 150 ML',1],['DEMO-FRIES','Plate',1]].map(([sku,label,quantityUnits])=>({ priceOptionId:getPrice(restaurant.code,sku,label).id, quantityUnits })), waiterUserId:waiter.id, actorUserId:waiter.id, notes:'Demo cancellation example', idempotencyKey:'demo:restaurant:cancelled:1' });
  if(['OPEN','SERVED','AWAITING_PAYMENT'].includes(cancelled.order.status)) await cancelRestaurantOrder({ orderId:cancelled.order.id, tenantId:tenant.id, branchId:restaurant.id, reason:'Demo guest changed the order before service', approvedByUserId:manager.id });
  if(!cancelled.replayed) await backdateOrder(cancelled.order.id,2);

  const existingWaste=await InventoryMovement.findOne({ where:{ tenantId:tenant.id, idempotencyKey:'demo:wastage:whisky:1' } });
  if(!existingWaste) await postAdjustment({ tenantId:tenant.id, branchId:restaurant.id, productId:products.get('DEMO-WHISKY-750').id, quantityDeltaBase:'-60', reason:'Demo bar spillage during service', idempotencyKey:'demo:wastage:whisky:1', actorUserId:manager.id, movementType:'WASTAGE' });

  const expenses=[
    { key:'rent',days:7,category:'Rent',description:'Demo weekly allocated premises rent',amount:450000 },
    { key:'electricity',days:4,category:'Utilities',description:'Demo electricity and kitchen utility expense',amount:82000 },
    { key:'cleaning',days:2,category:'Housekeeping',description:'Demo cleaning and consumables',amount:36000 },
    { key:'marketing',days:1,category:'Marketing',description:'Demo local promotion expense',amount:25000 }
  ];
  for(const expense of expenses){
    await sequelize.query(`INSERT INTO branch_expenses (id,"tenantId","branchId","expenseDate",category,description,"amountMinor",status,"createdByUserId","createdAt","updatedAt") VALUES (:id,:tenantId,:branchId,:expenseDate,:category,:description,:amountMinor,'POSTED',:createdBy,NOW(),NOW()) ON CONFLICT (id) DO NOTHING`, { replacements:{ id:stableUuid(`expense:${expense.key}`), tenantId:tenant.id, branchId:restaurant.id, expenseDate:dateOnly(expense.days), category:expense.category, description:expense.description, amountMinor:String(expense.amount), createdBy:manager.id } });
  }

  console.log(`[demo] ready: ${tenant.name} · owner ${DEMO.ownerEmail} · manager ${DEMO.managerEmail} · waiter ${DEMO.waiterEmail}`);
  return { tenantId:tenant.id, restaurantBranchId:restaurant.id, wineShopBranchId:wineShop.id, ownerEmail:DEMO.ownerEmail, managerEmail:DEMO.managerEmail, waiterEmail:DEMO.waiterEmail };
}

module.exports = { seedDemoData, DEMO };
