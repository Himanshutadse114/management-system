import React, { useEffect, useMemo, useState } from 'react';
import {
  Banknote,
  BarChart3,
  CreditCard,
  Clock3,
  Minus,
  PackageSearch,
  Plus,
  ReceiptText,
  RotateCcw,
  Search,
  ShoppingCart,
  Store,
  Trash2,
  Wine
} from 'lucide-react';
import RefreshButton from './RefreshButton';
import { api, apiErrorMessage, authHeaders } from './api';
import './sales.css';

function minorFromRupees(value, allowEmpty = true) {
  const raw = String(value ?? '').trim();
  if (!raw && allowEmpty) return '0';
  const match = raw.match(/^(\d+)(?:\.(\d{0,2}))?$/);
  if (!match) throw new Error('Enter a valid amount with up to 2 decimal places.');
  return (BigInt(match[1]) * 100n + BigInt((match[2] || '').padEnd(2, '0') || '0')).toString();
}

function formatMoney(value) {
  try {
    const amount = BigInt(value || 0);
    const negative = amount < 0n;
    const absolute = negative ? -amount : amount;
    return `${negative ? '-' : ''}₹${(absolute / 100n).toLocaleString('en-IN')}.${String(absolute % 100n).padStart(2, '0')}`;
  } catch (_) { return '₹0.00'; }
}

function BranchScope({ token, access, scope, setScope, onBranch }) {
  const isSuperAdmin = Boolean(access?.isSuperAdmin);
  const tenantAdmin = (access?.tenants || []).find((row) => row.role === 'TENANT_ADMIN');
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
        setTenants([tenantAdmin.tenant]);
        if (!scope.tenantId) setScope({ tenantId: tenantAdmin.tenantId, branchId: '' });
      } else {
        const assigned = access?.branches || [];
        const ids = [...new Set(assigned.map((row) => row.tenantId))];
        setTenants(ids.map((id) => ({ id, name: assigned.find((row) => row.tenantId === id)?.branch?.tenantName || 'Assigned business' })));
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
      setBranches(rows);
      let branchId = scope.branchId;
      if (!rows.some((row) => row.id === branchId)) branchId = rows[0]?.id || '';
      if (branchId !== scope.branchId) setScope({ ...scope, branchId });
      onBranch(rows.find((row) => row.id === branchId) || null);
    }
    loadBranches().catch(() => {});
  }, [scope.tenantId, scope.branchId, token, isSuperAdmin, tenantAdmin?.tenantId]);

  return <div className="sales-scope"><label><span>Business</span><select value={scope.tenantId} onChange={(e) => setScope({ tenantId: e.target.value, branchId: '' })}>{!tenants.length && <option value="">No business</option>}{tenants.map((row) => <option value={row.id} key={row.id}>{row.name}</option>)}</select></label><label><span>Branch</span><select value={scope.branchId} onChange={(e) => { const id = e.target.value; setScope({ ...scope, branchId: id }); onBranch(branches.find((row) => row.id === id) || null); }}>{!branches.length && <option value="">No branch</option>}{branches.map((row) => <option value={row.id} key={row.id}>{row.name} · {row.code}</option>)}</select></label></div>;
}

function Stat({ label, value, icon: Icon }) {
  return <div className="sales-stat"><div><strong>{value}</strong><span>{label}</span></div><div><Icon size={17} /></div></div>;
}

export default function SalesWorkspace({ token, access }) {
  const [scope, setScope] = useState({ tenantId: '', branchId: '' });
  const [tab, setTab] = useState('Sell');
  const [branch, setBranch] = useState(null);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [summary, setSummary] = useState({ orderCount: 0, salesMinor: '0', netSalesBeforeTaxMinor: '0', cogsMinor: '0', grossProfitMinor: '0', discountMinor: '0', paymentMix: [] });
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState('');
  const [discount, setDiscount] = useState('');
  const [discountReason, setDiscountReason] = useState('');
  const [tax, setTax] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('UPI');
  const [paymentReference, setPaymentReference] = useState('');
  const [loading, setLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');
  const [lastReceipt, setLastReceipt] = useState(null);
  const [shifts, setShifts] = useState([]);
  const [approvalNotes, setApprovalNotes] = useState({});
  const [refundTarget, setRefundTarget] = useState(null);
  const [refundForm, setRefundForm] = useState({ reason:'', stockDisposition:'RESTOCK', refundMethod:'CASH' });

  const base = scope.tenantId && scope.branchId ? `/sales/tenants/${scope.tenantId}/branches/${scope.branchId}` : '';
  const shiftBase = scope.tenantId && scope.branchId ? `/shifts/tenants/${scope.tenantId}/branches/${scope.branchId}` : '';

  async function load() {
    if (!base) return;
    try {
      setLoading(true);
      setError('');
      const headers = authHeaders(token);
      const [catalogue, orderResult, summaryResult, shiftResult] = await Promise.all([
        api.get(`${base}/catalogue`, { headers }),
        api.get(`${base}/orders?limit=50`, { headers }),
        api.get(`${base}/summary`, { headers }),
        api.get(`${shiftBase}?limit=100`, { headers })
      ]);
      setProducts(catalogue.data.products || []);
      setBranch(catalogue.data.branch || branch);
      setOrders(orderResult.data.orders || []);
      setSummary(summaryResult.data.summary || {});
      setShifts(shiftResult.data.shifts || []);
    } catch (err) { setError(apiErrorMessage(err)); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); setCart([]); }, [base]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((product) => [product.name, product.brand, product.sku, product.barcode].some((value) => String(value || '').toLowerCase().includes(q)));
  }, [products, search]);

  function addToCart(product, price) {
    const key = price.id;
    setCart((current) => {
      const existing = current.find((row) => row.key === key);
      if (existing) return current.map((row) => row.key === key ? { ...row, quantityUnits: row.quantityUnits + 1 } : row);
      return [...current, { key, productId: product.id, productName: product.name, productType: product.productType, inventoryUnit: product.inventoryUnit, availableQuantityBase: product.availableQuantityBase, priceOptionId: price.id, priceLabel: price.label, baseQuantityPerUnit: price.quantityBaseUnits, unitPriceMinor: price.priceMinor, overrideRupees:'', priceOverrideReason:'', quantityUnits: 1 }];
    });
  }

  function setQuantity(key, quantity) {
    if (quantity <= 0) return setCart((current) => current.filter((row) => row.key !== key));
    setCart((current) => current.map((row) => row.key === key ? { ...row, quantityUnits: quantity } : row));
  }

  function updateCartLine(key, patch) { setCart((current)=>current.map((row)=>row.key===key?{...row,...patch}:row)); }

  const subtotalMinor = useMemo(() => cart.reduce((total, row) => { let price=BigInt(row.unitPriceMinor||0); try{if(String(row.overrideRupees||'').trim())price=BigInt(minorFromRupees(row.overrideRupees,false));}catch(_){} return total+price*BigInt(row.quantityUnits); }, 0n), [cart]);
  let discountMinor = 0n;
  let taxMinor = 0n;
  try { discountMinor = BigInt(minorFromRupees(discount)); } catch (_) {}
  try { taxMinor = BigInt(minorFromRupees(tax)); } catch (_) {}
  const totalMinor = subtotalMinor - discountMinor + taxMinor;

  async function checkout() {
    try {
      if (!cart.length) throw new Error('Add at least one item.');
      setPaying(true);
      setError('');
      const response = await api.post(`${base}/checkout`, {
        lines: cart.map((row) => ({ priceOptionId: row.priceOptionId, quantityUnits: row.quantityUnits, unitPriceMinorOverride:String(row.overrideRupees||'').trim()?minorFromRupees(row.overrideRupees,false):null, priceOverrideReason:row.priceOverrideReason||null })),
        discountMinor: minorFromRupees(discount),
        discountReason: discountReason || null,
        taxMinor: minorFromRupees(tax),
        paymentMethod,
        paymentReference: paymentReference || null,
        idempotencyKey: crypto.randomUUID()
      }, { headers: authHeaders(token) });
      setLastReceipt(response.data.order);
      setCart([]);
      setDiscount('');
      setDiscountReason('');
      setTax('');
      setPaymentReference('');
      await load();
    } catch (err) { setError(err.message || apiErrorMessage(err)); }
    finally { setPaying(false); }
  }

  async function approveShift(shift) {
    try {
      setError('');
      await api.post(`${shiftBase}/${shift.id}/approve`, { approvalNote:approvalNotes[shift.id]||null }, { headers:authHeaders(token) });
      setApprovalNotes((current)=>({...current,[shift.id]:''}));
      await load();
    } catch (err) { setError(apiErrorMessage(err)); }
  }

  async function refundOrder(event) {
    event.preventDefault();
    try {
      setError('');
      await api.post(`${base}/orders/${refundTarget.id}/refund`, { ...refundForm, idempotencyKey:crypto.randomUUID() }, { headers:authHeaders(token) });
      setRefundTarget(null); setRefundForm({reason:'',stockDisposition:'RESTOCK',refundMethod:'CASH'}); await load();
    } catch (err) { setError(apiErrorMessage(err)); }
  }

  if (!scope.branchId) {
    return <div className="sales-page"><div className="sales-hero"><div><div className="sales-mini">Sales</div><h2>Choose a branch</h2><p>Select the branch where you want to make a sale.</p></div></div><BranchScope token={token} access={access} scope={scope} setScope={setScope} onBranch={setBranch} /><div className="sales-empty"><Store size={22} /><strong>No branch selected</strong><span>Choose a branch above.</span></div></div>;
  }

  return (
    <div className="sales-page">
      <div className="sales-hero"><div><div className="sales-mini">New sale</div><h2>{branch?.type === 'WINE_SHOP' ? 'Wine Shop Sale' : 'Counter Sale'}</h2><p>Choose items, enter payment details and collect the amount. Stock updates automatically after payment.</p></div><RefreshButton onRefresh={load} busy={loading}/></div>
      <BranchScope token={token} access={access} scope={scope} setScope={setScope} onBranch={setBranch} />
      {branch?.type === 'BAR_RESTAURANT' && <div className="sales-info">Use this page for counter sales. Use Restaurant for table orders and waiter bills.</div>}
      {error && <div className="sales-error">{error}</div>}

      <div className="sales-stats"><Stat label="Paid orders today" value={summary.orderCount || 0} icon={ReceiptText} /><Stat label="Sales today" value={formatMoney(summary.salesMinor)} icon={Banknote} /><Stat label="Cost of sold items" value={formatMoney(summary.cogsMinor)} icon={PackageSearch} /><Stat label="Gross profit" value={formatMoney(summary.grossProfitMinor)} icon={BarChart3} /></div>

      <div className="workspace-tabs">{[{label:'Sell',icon:CreditCard},{label:'History',icon:ReceiptText},{label:'Shifts',icon:Clock3}].map(({label,icon:Icon}) => <button key={label} className={tab===label?'is-active':''} onClick={() => setTab(label)}><Icon size={15}/>{label}</button>)}</div>

      {tab === 'Sell' && <div className="pos-layout">
        <section className="pos-catalogue">
          <div className="pos-toolbar"><div><div className="sales-mini">Step 1</div><h3>Choose items</h3></div><label className="pos-search"><Search size={14} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search item, brand or barcode..." /></label></div>
          <div className="product-pos-grid">{!filteredProducts.length && <div className="sales-empty"><Wine size={20} /><strong>No items available</strong><span>Add items and selling prices under Stock.</span></div>}{filteredProducts.map((product) => <article className="pos-product" key={product.id}><div className="pos-product-top">{product.imageUrl ? <img src={product.imageUrl} alt="" /> : <div className="pos-product-placeholder"><Wine size={20} /></div>}<div><strong>{product.name}</strong><span>{product.brand || product.productType}</span><small>In stock: {Number(product.availableQuantityBase || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })} {product.inventoryUnit}</small></div></div><div className="pos-prices">{(product.priceOptions || []).map((price) => <button key={price.id} onClick={() => addToCart(product, price)}><span>{price.label}</span><strong>{formatMoney(price.priceMinor)}</strong><Plus size={13} /></button>)}</div></article>)}</div>
        </section>

        <aside className="pos-cart">
          <div className="cart-head"><div><div className="sales-mini">Step 2</div><h3>Bill</h3></div><div className="cart-icon"><ShoppingCart size={17} /><span>{cart.reduce((sum, row) => sum + row.quantityUnits, 0)}</span></div></div>
          <div className="cart-lines">{!cart.length && <div className="cart-empty"><ShoppingCart size={22} /><strong>No items added</strong><span>Tap an item price to add it to the bill.</span></div>}{cart.map((row) => {let effective=BigInt(row.unitPriceMinor||0);try{if(String(row.overrideRupees||'').trim())effective=BigInt(minorFromRupees(row.overrideRupees,false));}catch(_){}return <div className="cart-line" key={row.key}><div className="cart-line-copy"><strong>{row.productName}</strong><span>{row.priceLabel} · {formatMoney(effective)} each</span><div className="price-override-fields"><input aria-label={`Override price for ${row.productName}`} value={row.overrideRupees} onChange={(event)=>updateCartLine(row.key,{overrideRupees:event.target.value})} inputMode="decimal" placeholder="Override ₹"/><input aria-label={`Override reason for ${row.productName}`} value={row.priceOverrideReason} onChange={(event)=>updateCartLine(row.key,{priceOverrideReason:event.target.value})} placeholder="Approval reason"/></div></div><div className="qty-control"><button aria-label="Reduce" onClick={() => setQuantity(row.key, row.quantityUnits - 1)}><Minus size={12} /></button><span>{row.quantityUnits}</span><button aria-label="Add" onClick={() => setQuantity(row.key, row.quantityUnits + 1)}><Plus size={12} /></button></div><strong className="line-total">{formatMoney(effective*BigInt(row.quantityUnits))}</strong><button aria-label="Remove" className="cart-remove" onClick={() => setQuantity(row.key, 0)}><Trash2 size={13} /></button></div>})}</div>
          <div className="checkout-fields"><div className="field-pair"><label><span>Discount ₹</span><input value={discount} onChange={(e) => setDiscount(e.target.value)} inputMode="decimal" placeholder="0.00" /></label><label><span>Tax ₹</span><input value={tax} onChange={(e) => setTax(e.target.value)} inputMode="decimal" placeholder="0.00" /></label></div>{Number(discount)>0&&<label><span>Discount approval reason</span><input value={discountReason} onChange={(e)=>setDiscountReason(e.target.value)} required placeholder="Happy hour, manager recovery, promotion..."/></label>}<label><span>How did they pay?</span><select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}><option value="UPI">UPI</option><option value="CASH">Cash</option><option value="CARD">Card</option><option value="OTHER">Other</option></select></label><label><span>Payment reference (optional)</span><input value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} placeholder="UPI or card reference" /></label></div>
          <div className="cart-totals"><div><span>Items</span><strong>{formatMoney(subtotalMinor)}</strong></div><div><span>Discount</span><strong>-{formatMoney(discountMinor)}</strong></div><div><span>Tax</span><strong>{formatMoney(taxMinor)}</strong></div><div className="grand-total"><span>Total</span><strong>{formatMoney(totalMinor)}</strong></div></div>
          <button className="scorm-button-primary checkout-button" disabled={paying || !cart.length || totalMinor < 0n} onClick={checkout}><CreditCard size={15} /> {paying ? 'Saving payment…' : `Collect ${formatMoney(totalMinor)}`}</button>
        </aside>
      </div>}

      {tab === 'History' && <section className="sales-history"><div className="sales-history-head"><div><div className="sales-mini">Sales ledger</div><h3>Recent sales & returns</h3></div><span>{orders.length} latest</span></div>{refundTarget&&<form className="refund-panel" onSubmit={refundOrder}><div><span>Full bill return</span><strong>{refundTarget.orderNumber} · {formatMoney(refundTarget.totalMinor)}</strong><small>The full paid bill will be reversed. Choose whether returned goods are safe to put back into stock.</small></div><label><span>Refund method</span><select value={refundForm.refundMethod} onChange={(event)=>setRefundForm({...refundForm,refundMethod:event.target.value})}><option>CASH</option><option>UPI</option><option>CARD</option><option>OTHER</option></select></label><label><span>Returned stock</span><select value={refundForm.stockDisposition} onChange={(event)=>setRefundForm({...refundForm,stockDisposition:event.target.value})}><option value="RESTOCK">Return to stock</option><option value="NO_RESTOCK">Do not restock</option></select></label><label><span>Reason</span><input value={refundForm.reason} onChange={(event)=>setRefundForm({...refundForm,reason:event.target.value})} required placeholder="Wrong item, customer return, billing mistake..."/></label><div><button type="button" className="scorm-button-secondary" onClick={()=>setRefundTarget(null)}>Cancel</button><button className="scorm-button-primary"><RotateCcw size={14}/>Approve refund</button></div></form>}{!orders.length ? <div className="sales-empty"><ReceiptText size={21} /><strong>No sales yet</strong><span>Paid sales will appear here.</span></div> : <div className="sales-table"><table><thead><tr><th>Bill</th><th>Time</th><th>Status</th><th>Items</th><th>Payment</th><th>Sales</th><th>Item cost</th><th>Profit</th><th>Action</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td><strong>{order.orderNumber}</strong></td><td>{new Date(order.paidAt || order.createdAt).toLocaleString('en-IN')}</td><td><span className={`sale-status status-${String(order.status).toLowerCase()}`}>{order.status}</span></td><td>{order.lines?.reduce((sum, line) => sum + Number(line.quantityUnits || 0), 0) || 0}</td><td>{order.payments?.[0]?.method || '—'}</td><td><strong>{formatMoney(order.totalMinor)}</strong></td><td>{formatMoney(order.cogsMinor)}</td><td className="profit-cell">{formatMoney(order.grossProfitMinor)}</td><td>{order.status==='PAID'?<button className="refund-link" onClick={()=>{setRefundTarget(order);setRefundForm((current)=>({...current,refundMethod:order.payments?.[0]?.method||'OTHER'}));}}><RotateCcw size={13}/>Refund</button>:<span>—</span>}</td></tr>)}</tbody></table></div>}</section>}

      {tab === 'Shifts' && <section className="sales-history shift-review"><div className="sales-history-head"><div><div className="sales-mini">Staff control</div><h3>Shift close & cash approval</h3></div><span>{shifts.filter((row)=>row.status==='SUBMITTED').length} awaiting approval</span></div>{!shifts.length?<div className="sales-empty"><Clock3 size={21}/><strong>No shifts yet</strong><span>Cashier and waiter shifts will appear here.</span></div>:<div className="shift-review-list">{shifts.map((shift)=><article key={shift.id} className={`shift-review-row status-${String(shift.status).toLowerCase()}`}><div><span>{shift.role} · {shift.status}</span><strong>{shift.user?.name||shift.user?.email||'Staff member'}</strong><small>{new Date(shift.openedAt).toLocaleString('en-IN')}{shift.closedAt?` → ${new Date(shift.closedAt).toLocaleString('en-IN')}`:''}</small></div><div className="shift-money"><span>Expected <strong>{formatMoney(shift.expectedCashMinor||shift.openingFloatMinor)}</strong></span><span>Declared <strong>{formatMoney(shift.declaredCashMinor)}</strong></span><span>Variance <strong className={Number(shift.varianceMinor)===0?'':'has-variance'}>{formatMoney(shift.varianceMinor)}</strong></span></div>{shift.status==='SUBMITTED'?<div className="shift-approve"><input aria-label={`Approval note for ${shift.user?.name||'staff'}`} value={approvalNotes[shift.id]||''} onChange={(event)=>setApprovalNotes((current)=>({...current,[shift.id]:event.target.value}))} placeholder={Number(shift.varianceMinor)!==0?'Variance explanation required':'Approval note (optional)'}/><button className="scorm-button-primary" onClick={()=>approveShift(shift)}>Approve close</button></div>:<div className="shift-note">{shift.approvalNote||shift.closeNote||'No note'}</div>}</article>)}</div>}</section>}

      {lastReceipt && <div className="receipt-toast"><ReceiptText size={17} /><div><strong>Payment saved</strong><span>{lastReceipt.orderNumber} · {formatMoney(lastReceipt.totalMinor)}</span></div><button onClick={() => setLastReceipt(null)}>×</button></div>}
    </div>
  );
}
