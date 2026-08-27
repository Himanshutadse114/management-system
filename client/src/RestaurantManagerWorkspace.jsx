import React, { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Banknote,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Copy,
  ExternalLink,
  GlassWater,
  LayoutGrid,
  Minus,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Trash2,
  UtensilsCrossed,
  Wine,
  X
} from 'lucide-react';
import { api, apiErrorMessage, authHeaders } from './api';
import './restaurant.css';

function formatMoney(value) {
  try {
    const amount = BigInt(value || 0);
    return `₹${(amount / 100n).toLocaleString('en-IN')}.${String(amount % 100n).padStart(2, '0')}`;
  } catch (_) { return '₹0.00'; }
}

function publicMenuUrl(token) {
  const url = new URL('/', window.location.origin);
  url.searchParams.set('menu', token);
  return url.toString();
}

function managerBranches(access) {
  return (access?.branches || []).filter((row) => row.role === 'BRANCH_MANAGER' && row.branch?.type === 'BAR_RESTAURANT');
}

function ScopeSelector({ token, access, scope, setScope, setBranch }) {
  const isSuperAdmin = Boolean(access?.isSuperAdmin);
  const tenantAdmin = (access?.tenants || []).find((row) => row.role === 'TENANT_ADMIN');
  const assignedManagers = useMemo(() => managerBranches(access), [access]);
  const [tenants, setTenants] = useState([]);
  const [branches, setBranches] = useState([]);

  useEffect(() => {
    async function loadTenants() {
      if (isSuperAdmin) {
        const { data } = await api.get('/platform/tenants', { headers: authHeaders(token) });
        const rows = data.tenants || [];
        setTenants(rows);
        if (!scope.tenantId && rows[0]?.id) setScope({ tenantId: rows[0].id, branchId: '' });
      } else if (tenantAdmin) {
        setTenants(tenantAdmin.tenant ? [tenantAdmin.tenant] : [{ id: tenantAdmin.tenantId, name: 'Assigned business' }]);
        if (!scope.tenantId) setScope({ tenantId: tenantAdmin.tenantId, branchId: '' });
      } else {
        const unique = [...new Map(assignedManagers.map((row) => [row.tenantId, { id: row.tenantId, name: row.branch?.tenantName || 'Assigned business' }])).values()];
        setTenants(unique);
        if (!scope.tenantId && assignedManagers[0]) setScope({ tenantId: assignedManagers[0].tenantId, branchId: assignedManagers[0].branchId });
      }
    }
    loadTenants().catch(() => {});
  }, [token, isSuperAdmin, tenantAdmin?.tenantId]);

  useEffect(() => {
    async function loadBranches() {
      if (!scope.tenantId) return;
      let rows = [];
      if (isSuperAdmin || tenantAdmin) {
        const { data } = await api.get(`/tenants/${scope.tenantId}/branches`, { headers: authHeaders(token) });
        rows = (data.branches || []).filter((row) => row.type === 'BAR_RESTAURANT');
      } else {
        rows = assignedManagers.filter((row) => row.tenantId === scope.tenantId).map((row) => row.branch).filter((row) => row?.type === 'BAR_RESTAURANT');
      }
      setBranches(rows);
      let nextBranchId = scope.branchId;
      if (!rows.some((row) => row.id === nextBranchId)) nextBranchId = rows[0]?.id || '';
      if (nextBranchId !== scope.branchId) setScope({ ...scope, branchId: nextBranchId });
      setBranch(rows.find((row) => row.id === nextBranchId) || null);
    }
    loadBranches().catch(() => {});
  }, [scope.tenantId, scope.branchId, token, isSuperAdmin, tenantAdmin?.tenantId]);

  return <div className="restaurant-scope"><label><span>Business</span><select value={scope.tenantId} onChange={(event) => setScope({ tenantId: event.target.value, branchId: '' })}>{!tenants.length && <option value="">No business</option>}{tenants.map((row) => <option value={row.id} key={row.id}>{row.name}</option>)}</select></label><label><span>Restaurant</span><select value={scope.branchId} onChange={(event) => { const id = event.target.value; setScope({ ...scope, branchId: id }); setBranch(branches.find((row) => row.id === id) || null); }}>{!branches.length && <option value="">No restaurant</option>}{branches.map((row) => <option value={row.id} key={row.id}>{row.name} · {row.code}</option>)}</select></label></div>;
}

function Empty({ icon: Icon, title, body }) {
  return <div className="restaurant-empty"><div><Icon size={20}/></div><strong>{title}</strong><span>{body}</span></div>;
}

export default function RestaurantManagerWorkspace({ token, access }) {
  const [scope, setScope] = useState({ tenantId: '', branchId: '' });
  const [branch, setBranch] = useState(null);
  const [tab, setTab] = useState('Orders');
  const [tables, setTables] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [waiters, setWaiters] = useState([]);
  const [search, setSearch] = useState('');
  const [draftLines, setDraftLines] = useState([]);
  const [tableId, setTableId] = useState('');
  const [waiterUserId, setWaiterUserId] = useState('');
  const [targetOrderId, setTargetOrderId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('UPI');
  const [tableForm, setTableForm] = useState({ name: '', code: '', seats: '4' });
  const [menuForm, setMenuForm] = useState({ productId: '', displayName: '', sectionName: 'Food & Drinks', description: '', featured: false });
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const base = scope.tenantId && scope.branchId ? `/restaurant/tenants/${scope.tenantId}/branches/${scope.branchId}` : '';

  async function loadAll() {
    if (!base) return;
    try {
      setBusy(true); setError('');
      const headers = authHeaders(token);
      const [tableResult, menuResult, catalogueResult, orderResult, waiterResult] = await Promise.all([
        api.get(`${base}/tables`, { headers }),
        api.get(`${base}/menu`, { headers }),
        api.get(`${base}/catalogue`, { headers }),
        api.get(`${base}/orders`, { headers }),
        api.get(`${base}/waiters`, { headers })
      ]);
      setTables(tableResult.data.tables || []);
      setMenuItems(menuResult.data.items || []);
      setProducts(catalogueResult.data.products || []);
      setOrders(orderResult.data.orders || []);
      setWaiters(waiterResult.data.waiters || []);
    } catch (err) { setError(apiErrorMessage(err)); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    setDraftLines([]); setTargetOrderId(''); setTableId(''); setWaiterUserId('');
    loadAll();
  }, [base]);

  function flash(message) { setNotice(message); window.setTimeout(() => setNotice(''), 2500); }

  const activeOrders = useMemo(() => orders.filter((order) => ['OPEN','SERVED','AWAITING_PAYMENT'].includes(order.status)), [orders]);
  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products.filter((product) => !query || [product.name, product.brand, product.sku].some((value) => String(value || '').toLowerCase().includes(query)));
  }, [products, search]);

  function addDraft(product, price) {
    setDraftLines((current) => {
      const existing = current.find((line) => line.priceOptionId === price.id);
      if (existing) return current.map((line) => line.priceOptionId === price.id ? { ...line, quantityUnits: line.quantityUnits + 1 } : line);
      return [...current, { priceOptionId: price.id, productName: product.name, priceLabel: price.label, priceMinor: price.priceMinor, quantityUnits: 1 }];
    });
  }
  function changeDraft(priceOptionId, quantity) {
    if (quantity <= 0) return setDraftLines((current) => current.filter((line) => line.priceOptionId !== priceOptionId));
    setDraftLines((current) => current.map((line) => line.priceOptionId === priceOptionId ? { ...line, quantityUnits: quantity } : line));
  }
  const draftTotal = useMemo(() => draftLines.reduce((sum, line) => sum + BigInt(line.priceMinor || 0) * BigInt(line.quantityUnits), 0n), [draftLines]);

  async function submitDraft() {
    try {
      if (!draftLines.length) throw new Error('Add at least one item.');
      setBusy(true); setError('');
      const payload = { lines: draftLines.map((line) => ({ priceOptionId: line.priceOptionId, quantityUnits: line.quantityUnits })) };
      if (targetOrderId) {
        await api.post(`${base}/orders/${targetOrderId}/lines`, payload, { headers: authHeaders(token) });
        flash('Items added to order.');
      } else {
        if (!tableId) throw new Error('Choose a table.');
        await api.post(`${base}/orders`, { ...payload, tableId, waiterUserId: waiterUserId || undefined, idempotencyKey: crypto.randomUUID() }, { headers: authHeaders(token) });
        flash('Order placed.');
      }
      setDraftLines([]); setTableId(''); setTargetOrderId('');
      await loadAll();
    } catch (err) { setError(err.message || apiErrorMessage(err)); }
    finally { setBusy(false); }
  }

  async function changeStatus(order, status) {
    try { setError(''); await api.post(`${base}/orders/${order.id}/status`, { status }, { headers: authHeaders(token) }); await loadAll(); flash(status === 'SERVED' ? 'Order marked served.' : 'Bill sent for payment.'); }
    catch (err) { setError(apiErrorMessage(err)); }
  }
  async function pay(order) {
    try { setError(''); await api.post(`${base}/orders/${order.id}/pay`, { paymentMethod }, { headers: authHeaders(token) }); await loadAll(); flash(`${order.orderNumber} paid.`); }
    catch (err) { setError(apiErrorMessage(err)); }
  }
  async function confirmCancel() {
    if (!cancelTarget || !cancelReason.trim()) return;
    try { setBusy(true); setError(''); await api.post(`${base}/orders/${cancelTarget.id}/cancel`, { reason: cancelReason.trim() }, { headers: authHeaders(token) }); setCancelTarget(null); setCancelReason(''); await loadAll(); flash('Order cancelled. Stock was restored automatically.'); }
    catch (err) { setError(apiErrorMessage(err)); }
    finally { setBusy(false); }
  }
  async function createTable(event) {
    event.preventDefault();
    try { setError(''); await api.post(`${base}/tables`, { ...tableForm, seats: Number(tableForm.seats || 4) }, { headers: authHeaders(token) }); setTableForm({ name:'', code:'', seats:'4' }); await loadAll(); flash('Table and QR code created.'); }
    catch (err) { setError(apiErrorMessage(err)); }
  }
  async function publishMenu(event) {
    event.preventDefault();
    try {
      setError('');
      const product = products.find((row) => row.id === menuForm.productId);
      if (!product) throw new Error('Choose an item.');
      await api.post(`${base}/menu`, { ...menuForm, displayName: menuForm.displayName || product.name }, { headers: authHeaders(token) });
      setMenuForm({ productId:'', displayName:'', sectionName:'Food & Drinks', description:'', featured:false });
      await loadAll(); flash('Item added to public menu.');
    } catch (err) { setError(err.message || apiErrorMessage(err)); }
  }
  async function toggleMenu(item) {
    try { setError(''); await api.patch(`${base}/menu/${item.id}`, { active: !item.active }, { headers: authHeaders(token) }); await loadAll(); }
    catch (err) { setError(apiErrorMessage(err)); }
  }
  async function copyLink(table) {
    try { await navigator.clipboard.writeText(publicMenuUrl(table.qrToken)); flash(`${table.name} menu link copied.`); }
    catch (_) { flash('Could not copy. Open the menu and copy the browser link.'); }
  }

  if (!scope.branchId) return <div className="restaurant-page"><div className="restaurant-hero"><div><div className="restaurant-mini">Restaurant</div><h2>Choose a restaurant</h2><p>Select the branch you want to manage.</p></div></div><ScopeSelector token={token} access={access} scope={scope} setScope={setScope} setBranch={setBranch}/><Empty icon={UtensilsCrossed} title="No restaurant selected" body="Choose one of your assigned restaurant branches."/></div>;

  return <div className="restaurant-page">
    <div className="restaurant-hero"><div><div className="restaurant-mini">Restaurant</div><h2>{branch?.name || 'Restaurant'}</h2><p>Manage orders, tables, QR menu and bills.</p></div><button className="scorm-button-secondary" onClick={loadAll} disabled={busy}><RefreshCw size={14} className={busy?'spin':''}/>Refresh</button></div>
    <ScopeSelector token={token} access={access} scope={scope} setScope={setScope} setBranch={setBranch}/>
    {error && <div className="restaurant-error">{error}</div>}{notice && <div className="restaurant-notice">{notice}</div>}
    <div className="restaurant-tabs">{[{label:'Orders',icon:ClipboardList},{label:'Tables',icon:QrCode},{label:'Menu',icon:UtensilsCrossed}].map(({label,icon:Icon}) => <button key={label} className={tab===label?'is-active':''} onClick={() => setTab(label)}><Icon size={15}/>{label}</button>)}</div>

    {tab === 'Orders' && <>
      <div className="service-layout"><section className="restaurant-panel service-catalogue"><div className="restaurant-panel-head"><div><div className="restaurant-mini">Create or update order</div><h3>{targetOrderId?'Add items':'New table order'}</h3></div><label className="restaurant-search"><Search size={14}/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search food or drinks..."/></label></div><div className="service-controls"><label><span>Order</span><select value={targetOrderId} onChange={(e)=>{setTargetOrderId(e.target.value);if(e.target.value)setTableId('')}}><option value="">New order</option>{activeOrders.filter((order)=>['OPEN','SERVED'].includes(order.status)).map((order)=><option value={order.id} key={order.id}>{order.orderNumber} · {order.table?.name || 'Table'} · {order.status}</option>)}</select></label>{!targetOrderId&&<label><span>Table</span><select value={tableId} onChange={(e)=>setTableId(e.target.value)}><option value="">Choose table</option>{tables.filter((table)=>table.status==='ACTIVE'&&!table.activeOrder).map((table)=><option value={table.id} key={table.id}>{table.name} · {table.code}</option>)}</select></label>}{!targetOrderId&&<label><span>Waiter</span><select value={waiterUserId} onChange={(e)=>setWaiterUserId(e.target.value)}><option value="">Manager</option>{waiters.map((row)=><option key={row.membershipId} value={row.userId}>{row.user?.name || row.email}</option>)}</select></label>}</div><div className="service-products">{filteredProducts.map((product)=><article className="service-product" key={product.id}><div className="service-product-copy">{product.imageUrl?<img src={product.imageUrl} alt=""/>:<div className="service-product-placeholder"><Wine size={17}/></div>}<div><strong>{product.name}</strong><span>{product.brand||product.productType}</span><small>{Number(product.availableQuantityBase||0).toLocaleString('en-IN',{maximumFractionDigits:3})} {product.inventoryUnit} in stock</small></div></div><div className="service-price-buttons">{(product.priceOptions||[]).map((price)=><button key={price.id} onClick={()=>addDraft(product,price)}><span>{price.label}</span><strong>{formatMoney(price.priceMinor)}</strong><Plus size={12}/></button>)}</div></article>)}</div></section><aside className="restaurant-panel order-draft"><div className="restaurant-panel-head"><div><div className="restaurant-mini">Current order</div><h3>Selected items</h3></div><span className="draft-count">{draftLines.reduce((sum,line)=>sum+line.quantityUnits,0)}</span></div><div className="draft-lines">{!draftLines.length&&<Empty icon={GlassWater} title="No items added" body="Tap a price to add an item."/>}{draftLines.map((line)=><div className="draft-line" key={line.priceOptionId}><div><strong>{line.productName}</strong><span>{line.priceLabel} · {formatMoney(line.priceMinor)}</span></div><div className="draft-qty"><button onClick={()=>changeDraft(line.priceOptionId,line.quantityUnits-1)}><Minus size={11}/></button><span>{line.quantityUnits}</span><button onClick={()=>changeDraft(line.priceOptionId,line.quantityUnits+1)}><Plus size={11}/></button></div><strong>{formatMoney(BigInt(line.priceMinor||0)*BigInt(line.quantityUnits))}</strong><button className="draft-trash" onClick={()=>changeDraft(line.priceOptionId,0)}><Trash2 size={12}/></button></div>)}</div><div className="draft-total"><span>Total</span><strong>{formatMoney(draftTotal)}</strong></div><button className="scorm-button-primary order-submit" disabled={!draftLines.length||busy} onClick={submitDraft}>{targetOrderId?'Add items':'Place order'}<ChevronRight size={14}/></button></aside></div>
      <section className="restaurant-panel active-orders"><div className="restaurant-panel-head"><div><div className="restaurant-mini">Open orders</div><h3>Orders & bills</h3></div><div className="payment-method"><span>Payment method</span><select value={paymentMethod} onChange={(e)=>setPaymentMethod(e.target.value)}><option>UPI</option><option>CASH</option><option>CARD</option><option>OTHER</option></select></div></div>{!activeOrders.length?<Empty icon={CheckCircle2} title="No open orders" body="All table orders are complete."/>:<div className="order-card-grid">{activeOrders.map((order)=><article className={`active-order status-${String(order.status).toLowerCase()}`} key={order.id}><div className="active-order-top"><div><span className="order-status">{String(order.status).replaceAll('_',' ')}</span><strong>{order.orderNumber}</strong><small>{order.table?.name || 'Table'} · {order.waiter?.name || order.waiter?.email || 'Manager'}</small></div><strong className="order-total">{formatMoney(order.totalMinor)}</strong></div><div className="active-order-lines">{(order.lines||[]).filter((line)=>line.status!=='CANCELLED').map((line)=><div key={line.id}><span>{line.quantityUnits} × {line.productNameSnapshot} · {line.priceLabelSnapshot}</span><strong>{formatMoney(line.lineSubtotalMinor)}</strong></div>)}</div><div className="active-order-actions">{order.status==='OPEN'&&<button onClick={()=>changeStatus(order,'SERVED')}>Mark served</button>}{['OPEN','SERVED'].includes(order.status)&&<button onClick={()=>changeStatus(order,'AWAITING_PAYMENT')}>Send bill</button>}{order.status==='AWAITING_PAYMENT'&&<button className="pay" onClick={()=>pay(order)}><Banknote size={12}/>Mark paid · {paymentMethod}</button>}<button className="cancel" onClick={()=>{setCancelTarget(order);setCancelReason('')}}>Cancel order</button></div></article>)}</div>}</section>
    </>}

    {tab === 'Tables' && <div className="restaurant-two-column"><form className="restaurant-panel restaurant-form" onSubmit={createTable}><div className="restaurant-panel-head"><div><div className="restaurant-mini">Add table</div><h3>New table</h3></div><LayoutGrid size={18}/></div><label><span>Table name</span><input value={tableForm.name} onChange={(e)=>setTableForm({...tableForm,name:e.target.value})} placeholder="Table 01" required/></label><div className="form-pair"><label><span>Short code</span><input value={tableForm.code} onChange={(e)=>setTableForm({...tableForm,code:e.target.value})} placeholder="T01" required/></label><label><span>Seats</span><input type="number" min="1" max="50" value={tableForm.seats} onChange={(e)=>setTableForm({...tableForm,seats:e.target.value})}/></label></div><button className="scorm-button-primary restaurant-submit"><Plus size={14}/>Add table & QR</button></form><section className="restaurant-panel"><div className="restaurant-panel-head"><div><div className="restaurant-mini">Table menu QR</div><h3>QR codes</h3></div><span>{tables.length} tables</span></div><div className="qr-grid">{tables.map((table)=>{const url=publicMenuUrl(table.qrToken);return <article className="qr-card" key={table.id}><div className="qr-canvas"><QRCodeSVG value={url} size={116} level="M" bgColor="#ffffff" fgColor="#111111"/></div><div><strong>{table.name}</strong><span>{table.code} · {table.seats} seats</span><small>{table.activeOrder?`Order: ${table.activeOrder.orderNumber}`:'Available'}</small></div><div className="qr-actions"><button type="button" onClick={()=>copyLink(table)}><Copy size={13}/>Copy link</button><a href={url} target="_blank" rel="noreferrer"><ExternalLink size={13}/>Open menu</a></div></article>})}</div></section></div>}

    {tab === 'Menu' && <div className="restaurant-two-column"><form className="restaurant-panel restaurant-form" onSubmit={publishMenu}><div className="restaurant-panel-head"><div><div className="restaurant-mini">Add menu item</div><h3>Add item to QR menu</h3></div><UtensilsCrossed size={18}/></div><label><span>Item</span><select value={menuForm.productId} onChange={(e)=>{const product=products.find((row)=>row.id===e.target.value);setMenuForm({...menuForm,productId:e.target.value,displayName:product?.name||''})}} required><option value="">Choose item</option>{products.map((product)=><option value={product.id} key={product.id}>{product.name}</option>)}</select></label><label><span>Name shown to guest</span><input value={menuForm.displayName} onChange={(e)=>setMenuForm({...menuForm,displayName:e.target.value})}/></label><label><span>Menu section</span><input value={menuForm.sectionName} onChange={(e)=>setMenuForm({...menuForm,sectionName:e.target.value})} placeholder="Whisky, Starters, Main Course..."/></label><label><span>Description</span><textarea rows="4" value={menuForm.description} onChange={(e)=>setMenuForm({...menuForm,description:e.target.value})}/></label><label className="featured-check"><input type="checkbox" checked={menuForm.featured} onChange={(e)=>setMenuForm({...menuForm,featured:e.target.checked})}/><span>Show as featured</span></label><button className="scorm-button-primary restaurant-submit"><Plus size={14}/>Add to menu</button></form><section className="restaurant-panel"><div className="restaurant-panel-head"><div><div className="restaurant-mini">Current menu</div><h3>Menu items</h3></div><span>{menuItems.length}</span></div><div className="menu-admin-list">{!menuItems.length&&<Empty icon={UtensilsCrossed} title="Menu is empty" body="Add items here to show them on the table QR menu."/>}{menuItems.map((item)=><div className="menu-admin-row" key={item.id}><div><strong>{item.displayName}</strong><span>{item.sectionName} · {item.product?.brand||item.product?.productType||'Item'}</span><div className="menu-price-chips">{(item.product?.priceOptions||[]).map((price)=><small key={price.id}>{price.label} {formatMoney(price.priceMinor)}</small>)}</div></div><button className={item.active?'is-live':'is-hidden'} onClick={()=>toggleMenu(item)}>{item.active?'Visible':'Hidden'}</button></div>)}</div></section></div>}

    {cancelTarget&&<div className="restaurant-modal"><button className="restaurant-modal-backdrop" onClick={()=>setCancelTarget(null)} aria-label="Close"/><div className="restaurant-modal-card"><div className="restaurant-modal-head"><div><div className="restaurant-mini">Cancel order</div><h3>{cancelTarget.orderNumber}</h3></div><button onClick={()=>setCancelTarget(null)}><X size={17}/></button></div><p>The order will stay in history and its stock will be restored automatically.</p><label><span>Reason for cancellation</span><textarea rows="4" value={cancelReason} onChange={(e)=>setCancelReason(e.target.value)} autoFocus/></label><div className="restaurant-modal-actions"><button className="scorm-button-secondary" onClick={()=>setCancelTarget(null)}>Keep order</button><button className="danger-action" disabled={!cancelReason.trim()||busy} onClick={confirmCancel}>Cancel order</button></div></div></div>}
  </div>;
}