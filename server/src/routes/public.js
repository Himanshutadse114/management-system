const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { Op } = require('sequelize');
const { Branch, Product, ProductPriceOption, BranchSettings } = require('../models');
const { RestaurantTable, MenuItem } = require('../models/restaurant');
const { Customer, GuestOrderRequest, CustomerFeedback } = require('../models/growth');
const { DirectStore } = require('../models/integrations');
const { getObjectStorage } = require('../storage/objectStorage');

const router = express.Router();

function backendBaseUrl() {
  const configured = String(process.env.RENDER_EXTERNAL_URL || '').trim().replace(/\/$/, '');
  if (configured) return configured;
  if (String(process.env.NODE_ENV || '').toLowerCase() !== 'production') {
    return `http://localhost:${Number(process.env.PORT || 5001)}`;
  }
  return '';
}

function mediaUrl(objectKey, productId) {
  if (!objectKey) return null;
  const publicBase = String(process.env.PUBLIC_MEDIA_BASE_URL || '').trim().replace(/\/$/, '');
  if (publicBase) return `${publicBase}/${objectKey}`;
  const backend = backendBaseUrl();
  return backend && productId ? `${backend}/api/public/products/${encodeURIComponent(productId)}/image` : null;
}

function cleanMenuName(displayName, productName) {
  return String(displayName || '').trim() || String(productName || '').trim() || 'Menu item';
}

function contentTypeForKey(objectKey) {
  switch (path.extname(String(objectKey || '')).toLowerCase()) {
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.png': return 'image/png';
    case '.webp': return 'image/webp';
    default: return 'application/octet-stream';
  }
}

router.get('/products/:productId/image', async (req, res, next) => {
  try {
    const product = await Product.findOne({
      where: { id: req.params.productId, status: 'ACTIVE' },
      attributes: ['id', 'imageObjectKey']
    });
    if (!product?.imageObjectKey) return res.status(404).end();

    const buffer = await getObjectStorage().getObjectBuffer(product.imageObjectKey);
    res.setHeader('Content-Type', contentTypeForKey(product.imageObjectKey));
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
    res.end(buffer);
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404) {
      return res.status(404).end();
    }
    next(error);
  }
});

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

    const settings = await BranchSettings.findOne({ where: { tenantId: table.tenantId, branchId: table.branchId }, attributes: ['upiVpa','allowedPaymentMethods'] });
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
          displayName: cleanMenuName(item.displayName, product.name),
          description: item.description,
          sectionName: item.sectionName,
          sortOrder: item.sortOrder,
          featured: item.featured,
          dietaryTags: Array.isArray(item.dietaryTags) ? item.dietaryTags : [],
          modifierGroups: Array.isArray(item.modifierGroups) ? item.modifierGroups : [],
          comboItems: Array.isArray(item.comboItems) ? item.comboItems : [],
          product: {
            id: product.id,
            name: product.name,
            brand: product.brand,
            productType: product.productType,
            imageUrl: mediaUrl(product.imageObjectKey, product.id),
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
      payment: { upiVpa: settings?.upiVpa || null, methods: settings?.allowedPaymentMethods || ['CASH','CARD','UPI'] },
      menu: items
    });
  } catch (error) {
    next(error);
  }
});

router.get('/store/:slug', async (req, res, next) => {
  try {
    const store = await DirectStore.findOne({ where: { slug: String(req.params.slug || '').trim().toLowerCase(), active: true } });
    if (!store) return res.status(404).json({ message: 'This direct store is unavailable.' });
    const branch = await Branch.findOne({ where: { id: store.branchId, tenantId: store.tenantId, status: 'ACTIVE' }, attributes: ['id','tenantId','name','code','address','phone','currency','type'] });
    if (!branch) return res.status(404).json({ message: 'This direct store is unavailable.' });
    const settings = await BranchSettings.findOne({ where:{tenantId:store.tenantId,branchId:store.branchId}, attributes:['upiVpa','allowedPaymentMethods'] });
    const menuItems = await MenuItem.findAll({ where: { tenantId: store.tenantId, branchId: store.branchId, active: true }, order: [['featured','DESC'],['sectionName','ASC'],['sortOrder','ASC'],['displayName','ASC']] });
    const productIds = [...new Set(menuItems.map((item) => item.productId))];
    const products = productIds.length ? await Product.findAll({ where: { id:{[Op.in]:productIds}, tenantId:store.tenantId, status:'ACTIVE' }, attributes:['id','name','brand','productType','imageObjectKey'], include:[{ model:ProductPriceOption, as:'priceOptions', where:{branchId:store.branchId,active:true}, required:true, attributes:['id','label','quantityBaseUnits','priceMinor','sortOrder'] }], order:[[{model:ProductPriceOption,as:'priceOptions'},'sortOrder','ASC']] }) : [];
    const productMap = new Map(products.map((product)=>[String(product.id),product.toJSON()]));
    const items = menuItems.map((item)=>{const product=productMap.get(String(item.productId));if(!product)return null;return {id:item.id,displayName:cleanMenuName(item.displayName,product.name),description:item.description,sectionName:item.sectionName,sortOrder:item.sortOrder,featured:item.featured,dietaryTags:item.dietaryTags||[],modifierGroups:item.modifierGroups||[],comboItems:item.comboItems||[],product:{...product,imageUrl:mediaUrl(product.imageObjectKey,product.id)}};}).filter(Boolean);
    res.set('Cache-Control','public, max-age=60, stale-while-revalidate=120');
    res.json({ branch:{name:store.name,code:branch.code,address:branch.address,phone:store.contactPhone||branch.phone,currency:branch.currency}, table:{name:'Pickup',code:'DIRECT',seats:0}, payment:{upiVpa:settings?.upiVpa||null,methods:settings?.allowedPaymentMethods||['CASH','CARD','UPI']}, store:{slug:store.slug,fulfillmentOptions:store.fulfillmentOptions,theme:store.theme}, menu:items });
  } catch (error) { next(error); }
});

router.post('/store/:slug/orders', async (req, res, next) => {
  try {
    const store = await DirectStore.findOne({ where:{slug:String(req.params.slug||'').trim().toLowerCase(),active:true} });
    if(!store) return res.status(404).json({message:'This direct store is unavailable.'});
    const requestedLines=Array.isArray(req.body?.lines)?req.body.lines.slice(0,50):[];
    if(!requestedLines.length)return res.status(400).json({message:'Add at least one item.'});
    const menuItems=await MenuItem.findAll({where:{tenantId:store.tenantId,branchId:store.branchId,active:true}});const byProduct=new Map(menuItems.map((row)=>[String(row.productId),row]));
    const options=await ProductPriceOption.findAll({where:{id:{[Op.in]:requestedLines.map((row)=>row.priceOptionId)},tenantId:store.tenantId,branchId:store.branchId,active:true},include:[{model:Product,as:'product',where:{status:'ACTIVE'},required:true}]});const optionMap=new Map(options.map((row)=>[String(row.id),row]));
    const cart=[];let subtotal=0n;
    for(const[index,requested]of requestedLines.entries()){const option=optionMap.get(String(requested.priceOptionId));const menuItem=option&&byProduct.get(String(option.productId));const quantity=Number(requested.quantityUnits);if(!option||!menuItem||!Number.isSafeInteger(quantity)||quantity<1||quantity>50)return res.status(400).json({message:`Cart line ${index+1} is unavailable.`});const requestedIds=new Set((Array.isArray(requested.modifiers)?requested.modifiers:[]).map(String));const selections=[];for(const group of Array.isArray(menuItem.modifierGroups)?menuItem.modifierGroups:[]){const selected=(group.options||[]).filter((row)=>requestedIds.has(String(row.id)));const min=Number(group.min||0),max=Number(group.max||group.options?.length||0);if(selected.length<min||selected.length>max)return res.status(400).json({message:`${menuItem.displayName}: choose ${min}-${max} option(s) from ${group.name}.`});selections.push(...selected.map((row)=>({optionId:row.id,label:row.label,priceMinor:String(row.priceMinor||0)})));}const knownIds=new Set((menuItem.modifierGroups||[]).flatMap((group)=>(group.options||[]).map((row)=>String(row.id))));if([...requestedIds].some((id)=>!knownIds.has(id)))return res.status(400).json({message:`Cart line ${index+1} contains an unavailable add-on.`});const unitMinor=BigInt(option.priceMinor)+selections.reduce((sum,row)=>sum+BigInt(row.priceMinor),0n);subtotal+=unitMinor*BigInt(quantity);cart.push({priceOptionId:option.id,productId:option.productId,name:menuItem.displayName,priceLabel:option.label,quantityUnits:quantity,unitMinor:unitMinor.toString(),modifiers:selections,notes:String(requested.notes||'').trim().slice(0,500)||null});}
    const phone=String(req.body?.phone||'').trim().slice(0,40)||null,guestName=String(req.body?.guestName||'').trim().slice(0,160)||null;if(!phone)return res.status(400).json({message:'Mobile number is required.'});let customer;[customer]=await Customer.findOrCreate({where:{tenantId:store.tenantId,phone},defaults:{tenantId:store.tenantId,phone,name:guestName,consentMarketing:req.body?.consentMarketing===true}});if(guestName)customer.name=guestName;if(req.body?.consentMarketing===true)customer.consentMarketing=true;await customer.save();
    const fulfillment=String(req.body?.fulfillment||'PICKUP').toUpperCase();if(!(store.fulfillmentOptions||['PICKUP']).includes(fulfillment))return res.status(400).json({message:'Fulfillment option is unavailable.'});const idempotencyKey=String(req.body?.idempotencyKey||crypto.randomUUID()).slice(0,180);const[orderRequest,created]=await GuestOrderRequest.findOrCreate({where:{tenantId:store.tenantId,idempotencyKey},defaults:{tenantId:store.tenantId,branchId:store.branchId,customerId:customer.id,channel:'DIRECT',fulfillment,guestName,phone,cart,subtotalMinor:subtotal.toString(),status:'PENDING',notes:String(req.body?.notes||'').trim().slice(0,1000)||null,idempotencyKey,paymentMethod:req.body?.paymentMethod==='UPI'?'UPI':'PAY_AT_OUTLET',paymentReference:String(req.body?.paymentReference||'').trim().slice(0,180)||null,paymentStatus:req.body?.paymentMethod==='UPI'?'AWAITING_VERIFICATION':'PAY_AT_OUTLET'}});res.status(created?202:200).json({request:{id:orderRequest.id,status:orderRequest.status,subtotalMinor:orderRequest.subtotalMinor,createdAt:orderRequest.createdAt},replayed:!created});
  } catch(error){next(error);}
});

router.post('/menu/:qrToken/orders', async (req, res, next) => {
  try {
    const table = await RestaurantTable.findOne({ where: { qrToken: String(req.params.qrToken || '').trim(), status: 'ACTIVE' } });
    if (!table) return res.status(404).json({ message: 'This table menu is unavailable.' });
    const requestedLines = Array.isArray(req.body?.lines) ? req.body.lines.slice(0, 50) : [];
    if (!requestedLines.length) return res.status(400).json({ message: 'Add at least one item.' });
    const menuItems = await MenuItem.findAll({ where: { tenantId: table.tenantId, branchId: table.branchId, active: true } });
    const byProduct = new Map(menuItems.map((row) => [String(row.productId), row]));
    const optionIds = requestedLines.map((row) => row.priceOptionId);
    const options = await ProductPriceOption.findAll({ where: { id: { [Op.in]: optionIds }, tenantId: table.tenantId, branchId: table.branchId, active: true }, include: [{ model: Product, as: 'product', where: { status: 'ACTIVE' }, required: true }] });
    const optionMap = new Map(options.map((row) => [String(row.id), row]));
    const cart = [];
    let subtotal = 0n;
    for (const [index, requested] of requestedLines.entries()) {
      const option = optionMap.get(String(requested.priceOptionId));
      const menuItem = option && byProduct.get(String(option.productId));
      const quantity = Number(requested.quantityUnits);
      if (!option || !menuItem || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 50) return res.status(400).json({ message: `Cart line ${index + 1} is unavailable.` });
      const requestedIds = new Set((Array.isArray(requested.modifiers) ? requested.modifiers : []).map(String));
      const selections = [];
      for (const group of Array.isArray(menuItem.modifierGroups) ? menuItem.modifierGroups : []) {
        const selected = (group.options || []).filter((row) => requestedIds.has(String(row.id)));
        const min = Number(group.min || 0); const max = Number(group.max || group.options?.length || 0);
        if (selected.length < min || selected.length > max) return res.status(400).json({ message: `${menuItem.displayName}: choose ${min}-${max} option(s) from ${group.name}.` });
        selections.push(...selected.map((row) => ({ optionId: row.id, label: row.label, priceMinor: String(row.priceMinor || 0) })));
      }
      const knownIds = new Set((menuItem.modifierGroups || []).flatMap((group) => (group.options || []).map((row) => String(row.id))));
      if ([...requestedIds].some((id) => !knownIds.has(id))) return res.status(400).json({ message: `Cart line ${index + 1} contains an unavailable add-on.` });
      const unitMinor = BigInt(option.priceMinor) + selections.reduce((sum, row) => sum + BigInt(row.priceMinor), 0n);
      subtotal += unitMinor * BigInt(quantity);
      cart.push({ priceOptionId: option.id, productId: option.productId, name: menuItem.displayName, priceLabel: option.label, quantityUnits: quantity, unitMinor: unitMinor.toString(), modifiers: selections, notes: String(requested.notes || '').trim().slice(0, 500) || null });
    }
    const phone = String(req.body?.phone || '').trim().slice(0, 40) || null;
    const guestName = String(req.body?.guestName || '').trim().slice(0, 160) || null;
    let customer = null;
    if (phone) {
      [customer] = await Customer.findOrCreate({ where: { tenantId: table.tenantId, phone }, defaults: { tenantId: table.tenantId, phone, name: guestName, consentMarketing: req.body?.consentMarketing === true } });
      if (guestName && customer.name !== guestName) customer.name = guestName;
      if (req.body?.consentMarketing === true) customer.consentMarketing = true;
      await customer.save();
    }
    const idempotencyKey = String(req.body?.idempotencyKey || crypto.randomUUID()).slice(0, 180);
    const [orderRequest, created] = await GuestOrderRequest.findOrCreate({
      where: { tenantId: table.tenantId, idempotencyKey },
      defaults: { tenantId: table.tenantId, branchId: table.branchId, tableId: table.id, customerId: customer?.id || null, channel: 'QR', fulfillment: 'DINE_IN', guestName, phone, cart, subtotalMinor: subtotal.toString(), status: 'PENDING', notes: String(req.body?.notes || '').trim().slice(0, 1000) || null, idempotencyKey, paymentMethod:req.body?.paymentMethod==='UPI'?'UPI':'PAY_AT_OUTLET',paymentReference:String(req.body?.paymentReference||'').trim().slice(0,180)||null,paymentStatus:req.body?.paymentMethod==='UPI'?'AWAITING_VERIFICATION':'PAY_AT_OUTLET' }
    });
    res.status(created ? 202 : 200).json({ request: { id: orderRequest.id, status: orderRequest.status, subtotalMinor: orderRequest.subtotalMinor, createdAt: orderRequest.createdAt }, replayed: !created });
  } catch (error) { next(error); }
});

router.post('/menu/:qrToken/feedback', async (req, res, next) => {
  try {
    const table = await RestaurantTable.findOne({ where: { qrToken: String(req.params.qrToken || '').trim(), status: 'ACTIVE' } });
    if (!table) return res.status(404).json({ message: 'This table menu is unavailable.' });
    const rating = Number(req.body?.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ message: 'Rating must be from 1 to 5.' });
    const phone = String(req.body?.phone || '').trim().slice(0, 40) || null;
    const customer = phone ? await Customer.findOne({ where: { tenantId: table.tenantId, phone } }) : null;
    const feedback = await CustomerFeedback.create({ tenantId: table.tenantId, branchId: table.branchId, customerId: customer?.id || null, rating, comment: String(req.body?.comment || '').trim().slice(0, 2000) || null, contactAllowed: req.body?.contactAllowed === true });
    res.status(201).json({ feedback: { id: feedback.id, rating: feedback.rating } });
  } catch (error) { next(error); }
});

module.exports = router;
