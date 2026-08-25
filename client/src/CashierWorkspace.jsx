import React, { useEffect, useMemo, useState } from 'react';
import {
  Banknote,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Minus,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  ShoppingCart,
  Store,
  UtensilsCrossed,
  Wine
} from 'lucide-react';
import { api, apiErrorMessage, authHeaders } from './api';
import './cashier.css';

function formatMoney(value) {
  try {
    const amount = BigInt(value || 0);
    return `₹${(amount / 100n).toLocaleString('en-IN')}.${String(amount % 100n).padStart(2, '0')}`;
  } catch (_) { return '₹0.00'; }
}

function cashierAssignments(access) {
  return (access?.branches || []).filter((row) => row.role === 'CASHIER');
}

export default function CashierWorkspace({ token, access }) {
  const assignments = useMemo(() => cashierAssignments(access), [access]);
  const [membershipId, setMembershipId] = useState(assignments[0]?.membershipId || '');
  const membership = assignments.find((row) => row.membershipId === membershipId) || assignments[0] || null;
  const tenantId = membership?.tenantId || '';
  const branchId = membership?.branchId || '';
  const branch = membership?.branch || null;
  const salesBase = tenantId && branchId ? `/sales/cashier/tenants/${tenantId}/branches/${branchId}` : '';
  const restaurantBase = tenantId && branchId && branch?.type === 'BAR_RESTAURANT' ? `/restaurant/cashier/tenants/${tenantId}/branches/${branchId}` : '';

  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [summary, setSummary] = useState({ orderCount: 0, salesMinor: '0', paymentMix: [] });
  const [settlements, setSettlements] = useState([]);
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('UPI');
  const [paymentReference, setPaymentReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [lastReceipt, setLastReceipt] = useState(null);

  useEffect(() => {
    if (!assignments.some((row) => row.membershipId === membershipId)) setMembershipId(assignments[0]?.membershipId || '');
  }, [assignments, membershipId]);

  async function load() {
    if (!salesBase) return;
    try {
      setBusy(true); setError('');
      const headers = authHeaders(token);
      const requests = [
        api.get(`${salesBase}/catalogue`, { headers }),
        api.get(`${salesBase}/orders?limit=30`, { headers }),
        api.get(`${salesBase}/summary`, { headers })
      ];
      if (restaurantBase) requests.push(api.get(`${restaurantBase}/settlements`, { headers }));
      const results = await Promise.all(requests);
      setProducts(results[0].data.products || []);
      setOrders(results[1].data.orders || []);
      setSummary(results[2].data.summary || {});
      setSettlements(restaurantBase ? results[3]?.data?.settlements || [] : []);
    } catch (err) { setError(apiErrorMessage(err)); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    setCart([]); setLastReceipt(null); setPaymentReference('');
    load();
  }, [salesBase, restaurantBase]);

  function flash(message) {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2400);
  }

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products.filter((product) => product.available !== false && (!query || [product.name, product.brand, product.sku, product.barcode].some((value) => String(value || '').toLowerCase().includes(query))));
  }, [products, search]);

  function add(product, price) {
    setCart((current) => {
      const existing = current.find((row) => row.priceOptionId === price.id);
      if (existing) return current.map((row) => row.priceOptionId === price.id ? { ...row, quantityUnits: row.quantityUnits + 1 } : row);
      return [...current, { priceOptionId: price.id, productName: product.name, priceLabel: price.label, priceMinor: price.priceMinor, quantityUnits: 1 }];
    });
  }

  function quantity(priceOptionId, next) {
    if (next <= 0) return setCart((current) => current.filter((row) => row.priceOptionId !== priceOptionId));
    setCart((current) => current.map((row) => row.priceOptionId === priceOptionId ? { ...row, quantityUnits: next } : row));
  }

  const totalMinor = useMemo(() => cart.reduce((sum, row) => sum + BigInt(row.priceMinor || 0) * BigInt(row.quantityUnits), 0n), [cart]);

  async function checkout() {
    try {
      if (!cart.length) throw new Error('Add at least one item to the cart.');
      setBusy(true); setError('');
      const { data } = await api.post(`${salesBase}/checkout`, {
        lines: cart.map((row) => ({ priceOptionId: row.priceOptionId, quantityUnits: row.quantityUnits })),
        paymentMethod,
        paymentReference: paymentReference.trim() || null,
        idempotencyKey: crypto.randomUUID()
      }, { headers: authHeaders(token) });
      setLastReceipt(data.order || null);
      setCart([]); setPaymentReference('');
      await load();
      flash('Payment completed and receipt created.');
    } catch (err) { setError(err.message || apiErrorMessage(err)); }
    finally { setBusy(false); }
  }

  async function settleRestaurant(order) {
    try {
      setBusy(true); setError('');
      await api.post(`${restaurantBase}/orders/${order.id}/pay`, {
        paymentMethod,
        paymentReference: paymentReference.trim() || null
      }, { headers: authHeaders(token) });
      setPaymentReference('');
      await load();
      flash(`${order.orderNumber} settled successfully.`);
    } catch (err) { setError(apiErrorMessage(err)); }
    finally { setBusy(false); }
  }

  if (!assignments.length) {
    return <div className="cashier-page"><div className="cashier-empty"><Store size={28}/><strong>No cashier assignment</strong><span>Your account does not currently have an active cashier assignment.</span></div></div>;
  }

  return <div className="cashier-page">
    <section className="cashier-head">
      <div><div className="cashier-kicker">CASHIER POS</div><h1>{branch?.name || 'Outlet'}</h1><p>Take counter payments and settle restaurant bills. Inventory cost and profit information are intentionally hidden from this role.</p></div>
      <div className="cashier-head-actions">{assignments.length > 1 && <select value={membership?.membershipId || ''} onChange={(event) => setMembershipId(event.target.value)}>{assignments.map((row) => <option value={row.membershipId} key={row.membershipId}>{row.branch?.name} · {row.branch?.code}</option>)}</select>}<button onClick={load} disabled={busy}><RefreshCw size={15} className={busy ? 'spin' : ''}/>Refresh</button></div>
    </section>

    {error && <div className="cashier-message error">{error}</div>}
    {notice && <div className="cashier-message success"><CheckCircle2 size={14}/>{notice}</div>}

    <div className="cashier-stats"><article><span>MY SALES TODAY</span><strong>{formatMoney(summary.salesMinor)}</strong><small>{summary.orderCount || 0} counter transactions</small></article><article><span>RESTAURANT BILLS</span><strong>{settlements.length}</strong><small>{restaurantBase ? 'Awaiting payment' : 'Not applicable to this outlet'}</small></article><article><span>OUTLET TYPE</span><strong>{branch?.type === 'BAR_RESTAURANT' ? 'Restaurant' : 'Wine Shop'}</strong><small>{branch?.code}</small></article></div>

    {restaurantBase && <section className="cashier-panel">
      <div className="cashier-panel-head"><div><span>SETTLEMENT QUEUE</span><h2>Restaurant bills awaiting payment</h2></div><div className="cashier-payment-select"><CreditCard size={14}/><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option>UPI</option><option>CASH</option><option>CARD</option><option>OTHER</option></select></div></div>
      {!settlements.length ? <div className="cashier-empty compact"><CheckCircle2 size={22}/><strong>No bills waiting</strong><span>Waiter orders appear here only after they request payment.</span></div> : <div className="cashier-settlements">{settlements.map((order) => <article key={order.id}><div className="cashier-settlement-top"><div><span>{order.table?.name || 'Table'}</span><strong>{order.orderNumber}</strong></div><strong>{formatMoney(order.totalMinor)}</strong></div><div className="cashier-settlement-lines">{(order.lines || []).filter((line) => line.status !== 'CANCELLED').map((line) => <div key={line.id}><span>{line.quantityUnits} × {line.productNameSnapshot} · {line.priceLabelSnapshot}</span><strong>{formatMoney(line.lineSubtotalMinor)}</strong></div>)}</div><button className="cashier-primary" onClick={() => settleRestaurant(order)} disabled={busy}><Banknote size={13}/>Receive {paymentMethod}<ChevronRight size={13}/></button></article>)}</div>}
    </section>}

    <div className="cashier-pos-layout">
      <section className="cashier-panel cashier-catalogue">
        <div className="cashier-panel-head"><div><span>COUNTER SALE</span><h2>Product catalogue</h2></div><label className="cashier-search"><Search size={14}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search product, SKU or barcode..."/></label></div>
        <div className="cashier-products">{filteredProducts.map((product) => <article key={product.id}><div className="cashier-product-copy">{product.imageUrl ? <img src={product.imageUrl} alt=""/> : <div className="cashier-product-image">{product.productType === 'ALCOHOL' ? <Wine size={18}/> : <UtensilsCrossed size={18}/>}</div>}<div><strong>{product.name}</strong><span>{product.brand || product.sku || product.productType}</span></div></div><div className="cashier-price-list">{(product.priceOptions || []).map((price) => <button key={price.id} onClick={() => add(product, price)}><span>{price.label}</span><strong>{formatMoney(price.priceMinor)}</strong><Plus size={12}/></button>)}</div></article>)}</div>
      </section>

      <aside className="cashier-panel cashier-cart">
        <div className="cashier-panel-head"><div><span>CART</span><h2>Current sale</h2></div><ShoppingCart size={18}/></div>
        {!cart.length ? <div className="cashier-empty compact"><ShoppingCart size={22}/><strong>Cart is empty</strong><span>Select a selling option from the catalogue.</span></div> : <div className="cashier-cart-lines">{cart.map((row) => <div key={row.priceOptionId}><div><strong>{row.productName}</strong><span>{row.priceLabel} · {formatMoney(row.priceMinor)}</span></div><div className="cashier-qty"><button onClick={() => quantity(row.priceOptionId, row.quantityUnits - 1)}><Minus size={11}/></button><span>{row.quantityUnits}</span><button onClick={() => quantity(row.priceOptionId, row.quantityUnits + 1)}><Plus size={11}/></button></div><strong>{formatMoney(BigInt(row.priceMinor || 0) * BigInt(row.quantityUnits))}</strong></div>)}</div>}
        <div className="cashier-cart-total"><span>Total</span><strong>{formatMoney(totalMinor)}</strong></div>
        <label className="cashier-field"><span>Payment method</span><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option>UPI</option><option>CASH</option><option>CARD</option><option>OTHER</option></select></label>
        <label className="cashier-field"><span>Reference (optional)</span><input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder="UPI / terminal reference"/></label>
        <button className="cashier-primary" disabled={busy || !cart.length} onClick={checkout}><Banknote size={13}/>Pay {formatMoney(totalMinor)}<ChevronRight size={13}/></button>
        {lastReceipt && <div className="cashier-receipt"><ReceiptText size={14}/><div><strong>{lastReceipt.orderNumber}</strong><span>Paid · {formatMoney(lastReceipt.totalMinor)}</span></div></div>}
      </aside>
    </div>

    <section className="cashier-panel">
      <div className="cashier-panel-head"><div><span>MY SHIFT</span><h2>Recent counter receipts</h2></div><ReceiptText size={18}/></div>
      {!orders.length ? <div className="cashier-empty compact"><ReceiptText size={22}/><strong>No receipts yet</strong><span>Your own completed counter transactions will appear here.</span></div> : <div className="cashier-recent">{orders.map((order) => <article key={order.id}><div><strong>{order.orderNumber}</strong><span>{new Date(order.createdAt).toLocaleString('en-IN',{dateStyle:'short',timeStyle:'short'})}</span></div><strong>{formatMoney(order.totalMinor)}</strong></article>)}</div>}
    </section>
  </div>;
}
