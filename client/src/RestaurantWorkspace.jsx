import React, { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Banknote,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  ExternalLink,
  GlassWater,
  LayoutGrid,
  Minus,
  Plus,
  QrCode,
  RefreshCw,
  ReceiptText,
  Search,
  Store,
  Trash2,
  UserRound,
  UsersRound,
  UtensilsCrossed,
  Wine,
  X
} from 'lucide-react';
import { api, apiErrorMessage, authHeaders } from './api';
import './restaurant.css';

function formatMoney(value) {
  try {
    const amount = BigInt(value || 0);
    const negative = amount < 0n;
    const absolute = negative ? -amount : amount;
    return `${negative ? '-' : ''}₹${(absolute / 100n).toLocaleString('en-IN')}.${String(absolute % 100n).padStart(2, '0')}`;
  } catch (_) { return '₹0.00'; }
}

function roleForScope(access, tenantId, branchId) {
  if (access?.isSuperAdmin) return 'SUPER_ADMIN';
  if ((access?.tenants || []).some((row) => row.tenantId === tenantId && row.role === 'TENANT_ADMIN')) return 'TENANT_ADMIN';
  return (access?.branches || []).find((row) => row.branchId === branchId)?.role || null;
}

function ScopeSelector({ token, access, scope, setScope, setBranch }) {
  const [tenants, setTenants] = useState([]);
  const [branches, setBranches] = useState([]);
  const isSuperAdmin = Boolean(access?.isSuperAdmin);
  const tenantAdmin = (access?.tenants || []).find((row) => row.role === 'TENANT_ADMIN');

  useEffect(() => {
    async function loadTenants() {
      if (isSuperAdmin) {
        const { data } = await api.get('/platform/tenants', { headers: authHeaders(token) });
        const rows = data.tenants || [];
        setTenants(rows);
        if (!scope.tenantId && rows[0]?.id) setScope({ tenantId: rows[0].id, branchId: '' });
      } else if (tenantAdmin) {
        setTenants([tenantAdmin.tenant]);
        if (!scope.tenantId) setScope({ tenantId: tenantAdmin.tenantId, branchId: '' });
      } else {
        const assigned = access?.branches || [];
        const unique = [...new Set(assigned.map((row) => row.tenantId))];
        setTenants(unique.map((id) => ({ id, name: assigned.find((row) => row.tenantId === id)?.branch?.tenantName || 'Assigned business' })));
        if (!scope.tenantId && assigned[0]) setScope({ tenantId: assigned[0].tenantId, branchId: assigned[0].branchId });
      }
    }
    loadTenants().catch(() => {});
  }, [token, isSuperAdmin, tenantAdmin?.tenantId]);

  useEffect(() => {
    async function loadBranches() {
      if (!scope.tenantId) return;
      let rows = [];
      if (!isSuperAdmin && !tenantAdmin) {
        rows = (access?.branches || []).filter((row) => row.tenantId === scope.tenantId).map((row) => row.branch).filter(Boolean);
      } else {
        const { data } = await api.get(`/tenants/${scope.tenantId}/branches`, { headers: authHeaders(token) });
        rows = data.branches || [];
      }
      const restaurantRows = rows.filter((row) => row.type === 'BAR_RESTAURANT');
      setBranches(restaurantRows);
      let branchId = scope.branchId;
      if (!restaurantRows.some((row) => row.id === branchId)) branchId = restaurantRows[0]?.id || '';
      if (branchId !== scope.branchId) setScope({ ...scope, branchId });
      setBranch(restaurantRows.find((row) => row.id === branchId) || null);
    }
    loadBranches().catch(() => {});
  }, [scope.tenantId, scope.branchId, token, isSuperAdmin, tenantAdmin?.tenantId]);

  return <div className="restaurant-scope"><label><span>Business</span><select value={scope.tenantId} onChange={(event) => setScope({ tenantId: event.target.value, branchId: '' })}>{!tenants.length && <option value="">No business</option>}{tenants.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label><span>Restaurant outlet</span><select value={scope.branchId} onChange={(event) => { const id = event.target.value; setScope({ ...scope, branchId: id }); setBranch(branches.find((row) => row.id === id) || null); }}>{!branches.length && <option value="">No Bar + Restaurant outlet</option>}{branches.map((row) => <option key={row.id} value={row.id}>{row.name} · {row.code}</option>)}</select></label></div>;
}

function Empty({ icon: Icon, title, body }) {
  return <div className="restaurant-empty"><div><Icon size={20} /></div><strong>{title}</strong><span>{body}</span></div>;
}

export default function RestaurantWorkspace({ token, access }) {
  const [scope, setScope] = useState({ tenantId: '', branchId: '' });
  const [branch, setBranch] = useState(null);
  const [tab, setTab] = useState('Service');
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
  const role = roleForScope(access, scope.tenantId, scope.branchId);
  const manager = ['SUPER_ADMIN', 'TENANT_ADMIN', 'BRANCH_MANAGER'].includes(role);
  const waiter = role === 'WAITER';

  async function loadAll() {
    if (!base) return;
    try {
      setBusy(true);
      setError('');
      const headers = authHeaders(token);
      const requests = [
        api.get(`${base}/tables`, { headers }),
        api.get(`${base}/menu`, { headers }),
        api.get(`${base}/catalogue`, { headers }),
        api.get(`${base}/orders`, { headers })
      ];
      if (manager) requests.push(api.get(`${base}/waiters`, { headers }));
      const results = await Promise.all(requests);
      setTables(results[0].data.tables || []);
      setMenuItems(results[1].data.items || []);
      setProducts(results[2].data.products || []);
      setOrders(results[3].data.orders || []);
      setWaiters(manager ? results[4]?.data?.waiters || [] : []);
    } catch (err) { setError(apiErrorMessage(err)); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    setDraftLines([]);
    setTargetOrderId('');
    setTableId('');
    loadAll();
  }, [base, manager]);

  function notify(message) {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2600);
  }

  const activeOrders = useMemo(() => orders.filter((order) => ['OPEN', 'SERVED', 'AWAITING_PAYMENT'].includes(order.status)), [orders]);
  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((product) => [product.name, product.brand, product.sku].some((value) => String(value || '').toLowerCase().includes(q)));
  }, [products, search]);

  function addDraft(product, price) {
    setDraftLines((current) => {
      const existing = current.find((line) => line.priceOptionId === price.id);
      if (existing) return current.map((line) => line.priceOptionId === price.id ? { ...line, quantityUnits: line.quantityUnits + 1 } : line);
      return [...current, { priceOptionId: price.id, productId: product.id, productName: product.name, priceLabel: price.label, priceMinor: price.priceMinor, quantityUnits: 1 }];
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
        notify('Items added to order.');
      } else {
        if (!tableId) throw new Error('Select a table.');
        await api.post(`${base}/orders`, { ...payload, tableId, waiterUserId: manager ? waiterUserId || null : undefined, idempotencyKey: crypto.randomUUID() }, { headers: authHeaders(token) });
        notify('Restaurant order opened.');
      }
      setDraftLines([]); setTableId(''); setTargetOrderId('');
      await loadAll();
    } catch (err) { setError(err.message || apiErrorMessage(err)); }
    finally { setBusy(false); }
  }

  async function changeStatus(order, status) {
    try { setError(''); await api.post(`${base}/orders/${order.id}/status`, { status }, { headers: authHeaders(token) }); await loadAll(); notify(`Order marked ${status.toLowerCase().replaceAll('_', ' ')}.`); }
    catch (err) { setError(apiErrorMessage(err)); }
  }

  async function pay(order) {
    try { setError(''); await api.post(`${base}/orders/${order.id}/pay`, { paymentMethod }, { headers: authHeaders(token) }); await loadAll(); notify(`Payment recorded for ${order.orderNumber}.`); }
    catch (err) { setError(apiErrorMessage(err)); }
  }

  async function confirmCancel() {
    if (!cancelTarget || !cancelReason.trim()) return;
    try { setBusy(true); setError(''); await api.post(`${base}/orders/${cancelTarget.id}/cancel`, { reason: cancelReason.trim() }, { headers: authHeaders(token) }); setCancelTarget(null); setCancelReason(''); await loadAll(); notify('Order cancelled and stock restored.'); }
    catch (err) { setError(apiErrorMessage(err)); }
    finally { setBusy(false); }
  }

  async function createTable(event) {
    event.preventDefault();
    try { setError(''); await api.post(`${base}/tables`, { ...tableForm, seats: Number(tableForm.seats || 4) }, { headers: authHeaders(token) }); setTableForm({ name: '', code: '', seats: '4' }); await loadAll(); notify('Table and QR token created.'); }
    catch (err) { setError(apiErrorMessage(err)); }
  }

  async function publishMenu(event) {
    event.preventDefault();
    try {
      setError('');
      const product = products.find((row) => row.id === menuForm.productId);
      if (!product) throw new Error('Select a product.');
      await api.post(`${base}/menu`, { ...menuForm, displayName: menuForm.displayName || product.name }, { headers: authHeaders(token) });
      setMenuForm({ productId: '', displayName: '', sectionName: 'Food & Drinks', description: '', featured: false });
      await loadAll(); notify('Menu item published.');
    } catch (err) { setError(err.message || apiErrorMessage(err)); }
  }

  async function toggleMenu(item) {
    try { setError(''); await api.patch(`${base}/menu/${item.id}`, { active: !item.active }, { headers: authHeaders(token) }); await loadAll(); }
    catch (err) { setError(apiErrorMessage(err)); }
  }

  if (!scope.branchId) {
    return <div className="restaurant-page"><div className="restaurant-hero"><div><div className="restaurant-mini">Tables · QR menu · waiter service</div><h2>Restaurant Operations</h2><p>Select a Bar + Restaurant outlet to start.</p></div></div><ScopeSelector token={token} access={access} scope={scope} setScope={setScope} setBranch={setBranch} /><Empty icon={UtensilsCrossed} title="No restaurant selected" body="Only branches created as Bar + Restaurant appear here." /></div>;
  }

  const tabs = [{ label: 'Service', icon: ClipboardList }, ...(manager ? [{ label: 'Tables & QR', icon: QrCode }, { label: 'Public Menu', icon: UtensilsCrossed }] : [])];

  return (
    <div className="restaurant-page">
      <div className="restaurant-hero"><div><div className="restaurant-mini">Table service · accountable orders</div><h2>Restaurant Operations</h2><p>Waiter orders remain traceable from acceptance through service and payment. Unresolved orders stay visible until paid or manager-cancelled.</p></div><button className="scorm-button-secondary" onClick={loadAll} disabled={busy}><RefreshCw size={14} className={busy ? 'spin' : ''} /> Refresh</button></div>
      <ScopeSelector token={token} access={access} scope={scope} setScope={setScope} setBranch={setBranch} />
      {error && <div className="restaurant-error">{error}</div>}{notice && <div className="restaurant-notice">{notice}</div>}
      <div className="restaurant-tabs">{tabs.map(({ label, icon: Icon }) => <button key={label} className={tab === label ? 'is-active' : ''} onClick={() => setTab(label)}><Icon size={15} />{label}</button>)}</div>

      {tab === 'Service' && <div className="service-layout">
        <section className="restaurant-panel service-catalogue">
          <div className="restaurant-panel-head"><div><div className="restaurant-mini">Order builder</div><h3>{targetOrderId ? 'Add items to order' : 'Open table order'}</h3></div><label className="restaurant-search"><Search size={14} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products..." /></label></div>
          <div className="service-controls"><label><span>Target</span><select value={targetOrderId} onChange={(e) => { setTargetOrderId(e.target.value); if (e.target.value) setTableId(''); }}><option value="">New table order</option>{activeOrders.filter((order) => ['OPEN', 'SERVED'].includes(order.status)).map((order) => <option key={order.id} value={order.id}>{order.orderNumber} · {order.table?.name || 'Table'} · {order.status}</option>)}</select></label>{!targetOrderId && <label><span>Table</span><select value={tableId} onChange={(e) => setTableId(e.target.value)}><option value="">Select table</option>{tables.filter((table) => table.status === 'ACTIVE' && !table.activeOrder).map((table) => <option key={table.id} value={table.id}>{table.name} · {table.code}</option>)}</select></label>}{manager && !targetOrderId && <label><span>Waiter</span><select value={waiterUserId} onChange={(e) => setWaiterUserId(e.target.value)}><option value="">Manager / self</option>{waiters.map((row) => <option key={row.membershipId} value={row.userId}>{row.user?.name || row.email}</option>)}</select></label>}</div>
          <div className="service-products">{filteredProducts.map((product) => <article key={product.id} className="service-product"><div className="service-product-copy">{product.imageUrl ? <img src={product.imageUrl} alt="" /> : <div className="service-product-placeholder"><Wine size={17} /></div>}<div><strong>{product.name}</strong><span>{product.brand || product.productType}</span><small>{Number(product.availableQuantityBase || 0).toLocaleString('en-IN',{maximumFractionDigits:3})} {product.inventoryUnit} available</small></div></div><div className="service-price-buttons">{(product.priceOptions || []).map((price) => <button key={price.id} onClick={() => addDraft(product, price)}><span>{price.label}</span><strong>{formatMoney(price.priceMinor)}</strong><Plus size={12} /></button>)}</div></article>)}</div>
        </section>

        <aside className="restaurant-panel order-draft"><div className="restaurant-panel-head"><div><div className="restaurant-mini">Selected items</div><h3>Order draft</h3></div><span className="draft-count">{draftLines.reduce((sum,line)=>sum+line.quantityUnits,0)}</span></div><div className="draft-lines">{!draftLines.length && <Empty icon={GlassWater} title="Nothing selected" body="Tap a portion or item price to build the order." />}{draftLines.map((line) => <div className="draft-line" key={line.priceOptionId}><div><strong>{line.productName}</strong><span>{line.priceLabel} · {formatMoney(line.priceMinor)}</span></div><div className="draft-qty"><button onClick={()=>changeDraft(line.priceOptionId,line.quantityUnits-1)}><Minus size={11}/></button><span>{line.quantityUnits}</span><button onClick={()=>changeDraft(line.priceOptionId,line.quantityUnits+1)}><Plus size={11}/></button></div><strong>{formatMoney(BigInt(line.priceMinor)*BigInt(line.quantityUnits))}</strong><button className="draft-trash" onClick={()=>changeDraft(line.priceOptionId,0)}><Trash2 size={12}/></button></div>)}</div><div className="draft-total"><span>Total</span><strong>{formatMoney(draftTotal)}</strong></div><button className="scorm-button-primary order-submit" disabled={!draftLines.length||busy} onClick={submitDraft}>{targetOrderId?'Add to order':'Open order'}<ChevronRight size={14}/></button></aside>
      </div>}

      {tab === 'Service' && <section className="restaurant-panel active-orders"><div className="restaurant-panel-head"><div><div className="restaurant-mini">Unresolved reconciliation</div><h3>Active table orders</h3></div><div className="payment-method"><span>Settlement</span><select value={paymentMethod} onChange={(e)=>setPaymentMethod(e.target.value)}><option>UPI</option><option>CASH</option><option>CARD</option><option>OTHER</option></select></div></div>{!activeOrders.length ? <Empty icon={CheckCircle2} title="No unresolved orders" body="All current table orders are settled or manager-cancelled." /> : <div className="order-card-grid">{activeOrders.map((order)=><article className={`active-order status-${order.status.toLowerCase()}`} key={order.id}><div className="active-order-top"><div><span className="order-status">{order.status.replaceAll('_',' ')}</span><strong>{order.orderNumber}</strong><small>{order.table?.name || 'Table'} · {order.waiter?.name || order.waiter?.email || 'Manager'}</small></div><strong className="order-total">{formatMoney(order.totalMinor)}</strong></div><div className="active-order-lines">{(order.lines||[]).filter(line=>line.status!=='CANCELLED').map(line=><div key={line.id}><span>{line.quantityUnits} × {line.productNameSnapshot} · {line.priceLabelSnapshot}</span><strong>{formatMoney(line.lineSubtotalMinor)}</strong></div>)}</div><div className="active-order-meta"><span><Clock3 size={12}/>{new Date(order.createdAt).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</span><span><UserRound size={12}/>{order.waiter?.name||'Assigned staff'}</span></div><div className="active-order-actions">{order.status==='OPEN'&&<button onClick={()=>changeStatus(order,'SERVED')}>Mark served</button>}{['OPEN','SERVED'].includes(order.status)&&<button onClick={()=>changeStatus(order,'AWAITING_PAYMENT')}>Request payment</button>}<button className="pay" onClick={()=>pay(order)}><Banknote size={12}/> Pay {paymentMethod}</button>{manager&&<button className="cancel" onClick={()=>{setCancelTarget(order);setCancelReason('')}}>Cancel</button>}</div></article>)}</div>}</section>}

      {tab === 'Tables & QR' && manager && <div className="restaurant-two-column"><form className="restaurant-panel restaurant-form" onSubmit={createTable}><div className="restaurant-panel-head"><div><div className="restaurant-mini">Floor setup</div><h3>Create table</h3></div><LayoutGrid size={18}/></div><label><span>Table name</span><input value={tableForm.name} onChange={(e)=>setTableForm({...tableForm,name:e.target.value})} placeholder="Table 01" required/></label><div className="form-pair"><label><span>Code</span><input value={tableForm.code} onChange={(e)=>setTableForm({...tableForm,code:e.target.value})} placeholder="T01" required/></label><label><span>Seats</span><input type="number" min="1" max="50" value={tableForm.seats} onChange={(e)=>setTableForm({...tableForm,seats:e.target.value})}/></label></div><button className="scorm-button-primary restaurant-submit"><Plus size={14}/>Create table & QR</button></form><section className="restaurant-panel"><div className="restaurant-panel-head"><div><div className="restaurant-mini">Public table links</div><h3>QR codes</h3></div><span>{tables.length} tables</span></div><div className="qr-grid">{tables.map(table=>{const url=`${window.location.origin}/menu/${table.qrToken}`;return <article className="qr-card" key={table.id}><div className="qr-canvas"><QRCodeSVG value={url} size={116} level="M" bgColor="#ffffff" fgColor="#111111"/></div><div><strong>{table.name}</strong><span>{table.code} · {table.seats} seats</span><small>{table.activeOrder?`Active: ${table.activeOrder.orderNumber}`:'Available'}</small></div><a href={url} target="_blank" rel="noreferrer"><ExternalLink size={13}/>Open menu</a></article>})}</div></section></div>}

      {tab === 'Public Menu' && manager && <div className="restaurant-two-column"><form className="restaurant-panel restaurant-form" onSubmit={publishMenu}><div className="restaurant-panel-head"><div><div className="restaurant-mini">Guest-facing catalogue</div><h3>Publish menu item</h3></div><UtensilsCrossed size={18}/></div><label><span>Product</span><select value={menuForm.productId} onChange={(e)=>{const product=products.find(row=>row.id===e.target.value);setMenuForm({...menuForm,productId:e.target.value,displayName:product?.name||''})}} required><option value="">Select product</option>{products.map(product=><option value={product.id} key={product.id}>{product.name}</option>)}</select></label><label><span>Guest display name</span><input value={menuForm.displayName} onChange={(e)=>setMenuForm({...menuForm,displayName:e.target.value})}/></label><label><span>Section</span><input value={menuForm.sectionName} onChange={(e)=>setMenuForm({...menuForm,sectionName:e.target.value})} placeholder="Cocktails, Whisky, Starters..."/></label><label><span>Description</span><textarea rows="4" value={menuForm.description} onChange={(e)=>setMenuForm({...menuForm,description:e.target.value})} placeholder="Short guest-facing description"/></label><label className="featured-check"><input type="checkbox" checked={menuForm.featured} onChange={(e)=>setMenuForm({...menuForm,featured:e.target.checked})}/><span>Feature this item</span></label><button className="scorm-button-primary restaurant-submit"><Plus size={14}/>Publish to QR menu</button></form><section className="restaurant-panel"><div className="restaurant-panel-head"><div><div className="restaurant-mini">Published catalogue</div><h3>Menu items</h3></div><span>{menuItems.length}</span></div><div className="menu-admin-list">{!menuItems.length&&<Empty icon={UtensilsCrossed} title="Menu is empty" body="Publish products with branch pricing to make them visible on table QR menus."/>}{menuItems.map(item=><div className="menu-admin-row" key={item.id}><div><strong>{item.displayName}</strong><span>{item.sectionName} · {item.product?.brand||item.product?.productType||'Product'}</span><div className="menu-price-chips">{(item.product?.priceOptions||[]).map(price=><small key={price.id}>{price.label} {formatMoney(price.priceMinor)}</small>)}</div></div><button className={item.active?'is-live':'is-hidden'} onClick={()=>toggleMenu(item)}>{item.active?'Live':'Hidden'}</button></div>)}</div></section></div>}

      {cancelTarget && <div className="restaurant-modal"><button className="restaurant-modal-backdrop" onClick={()=>setCancelTarget(null)} aria-label="Close"/><div className="restaurant-modal-card"><div className="restaurant-modal-head"><div><div className="restaurant-mini">Manager approval</div><h3>Cancel {cancelTarget.orderNumber}</h3></div><button onClick={()=>setCancelTarget(null)}><X size={17}/></button></div><p>The order stays in history. Its active inventory lines will be restored through compensating ledger movements.</p><label><span>Cancellation reason</span><textarea rows="4" value={cancelReason} onChange={(e)=>setCancelReason(e.target.value)} placeholder="Customer cancelled, incorrect table, operational exception..." autoFocus/></label><div className="restaurant-modal-actions"><button className="scorm-button-secondary" onClick={()=>setCancelTarget(null)}>Keep order</button><button className="danger-action" disabled={!cancelReason.trim()||busy} onClick={confirmCancel}>Approve cancellation</button></div></div></div>}
    </div>
  );
}
