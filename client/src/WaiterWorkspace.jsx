import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  Clock3,
  Minus,
  Plus,
  RefreshCw,
  Search,
  ShoppingBag,
  Table2,
  UtensilsCrossed,
  Wine
} from 'lucide-react';
import { api, apiErrorMessage, authHeaders } from './api';
import './waiter.css';

function formatMoney(value) {
  try {
    const amount = BigInt(value || 0);
    return `₹${(amount / 100n).toLocaleString('en-IN')}.${String(amount % 100n).padStart(2, '0')}`;
  } catch (_) { return '₹0.00'; }
}

function membershipBranches(access) {
  return (access?.branches || []).filter((row) => row.role === 'WAITER' && row.branch?.type === 'BAR_RESTAURANT');
}

function statusLabel(status) {
  return String(status || '').replaceAll('_', ' ').toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

export default function WaiterWorkspace({ token, access }) {
  const assignments = useMemo(() => membershipBranches(access), [access]);
  const [membershipId, setMembershipId] = useState(assignments[0]?.membershipId || '');
  const membership = assignments.find((row) => row.membershipId === membershipId) || assignments[0] || null;
  const tenantId = membership?.tenantId || '';
  const branchId = membership?.branchId || '';
  const branch = membership?.branch || null;
  const base = tenantId && branchId ? `/restaurant/tenants/${tenantId}/branches/${branchId}` : '';

  const [tables, setTables] = useState([]);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [search, setSearch] = useState('');
  const [tableId, setTableId] = useState('');
  const [targetOrderId, setTargetOrderId] = useState('');
  const [draft, setDraft] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!assignments.some((row) => row.membershipId === membershipId)) setMembershipId(assignments[0]?.membershipId || '');
  }, [assignments, membershipId]);

  async function load() {
    if (!base) return;
    try {
      setBusy(true);
      setError('');
      const headers = authHeaders(token);
      const [tableResult, catalogueResult, orderResult] = await Promise.all([
        api.get(`${base}/tables`, { headers }),
        api.get(`${base}/catalogue`, { headers }),
        api.get(`${base}/orders`, { headers })
      ]);
      setTables(tableResult.data.tables || []);
      setProducts(catalogueResult.data.products || []);
      setOrders(orderResult.data.orders || []);
    } catch (err) { setError(apiErrorMessage(err)); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    setTableId(''); setTargetOrderId(''); setDraft([]);
    load();
  }, [base]);

  function flash(message) {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2400);
  }

  const activeOrders = useMemo(() => orders.filter((order) => ['OPEN', 'SERVED', 'AWAITING_PAYMENT'].includes(order.status)), [orders]);
  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products.filter((product) => product.available !== false && (!query || [product.name, product.brand, product.productType].some((value) => String(value || '').toLowerCase().includes(query))));
  }, [products, search]);

  function selectTable(table) {
    if (table.activeOrder?.own) {
      setTargetOrderId(table.activeOrder.id);
      setTableId('');
      return;
    }
    if (table.activeOrder?.occupied) return;
    setTargetOrderId('');
    setTableId(table.id);
  }

  function selectOwnOrder(order) {
    setTargetOrderId(order.id);
    setTableId('');
  }

  function addItem(product, price) {
    setDraft((current) => {
      const existing = current.find((row) => row.priceOptionId === price.id);
      if (existing) return current.map((row) => row.priceOptionId === price.id ? { ...row, quantityUnits: row.quantityUnits + 1 } : row);
      return [...current, {
        priceOptionId: price.id,
        productName: product.name,
        priceLabel: price.label,
        priceMinor: price.priceMinor,
        quantityUnits: 1
      }];
    });
  }

  function quantity(priceOptionId, next) {
    if (next <= 0) return setDraft((current) => current.filter((row) => row.priceOptionId !== priceOptionId));
    setDraft((current) => current.map((row) => row.priceOptionId === priceOptionId ? { ...row, quantityUnits: next } : row));
  }

  const draftTotal = useMemo(() => draft.reduce((sum, row) => sum + BigInt(row.priceMinor || 0) * BigInt(row.quantityUnits), 0n), [draft]);

  async function submitOrder() {
    try {
      if (!draft.length) throw new Error('Add at least one menu item.');
      if (!targetOrderId && !tableId) throw new Error('Select an available table.');
      setBusy(true); setError('');
      const payload = { lines: draft.map((row) => ({ priceOptionId: row.priceOptionId, quantityUnits: row.quantityUnits })) };
      if (targetOrderId) {
        await api.post(`${base}/orders/${targetOrderId}/lines`, payload, { headers: authHeaders(token) });
        flash('Items added to your table order.');
      } else {
        await api.post(`${base}/orders`, { ...payload, tableId, idempotencyKey: crypto.randomUUID() }, { headers: authHeaders(token) });
        flash('Table order opened.');
      }
      setDraft([]); setTableId(''); setTargetOrderId('');
      await load();
    } catch (err) { setError(err.message || apiErrorMessage(err)); }
    finally { setBusy(false); }
  }

  async function updateStatus(order, status) {
    try {
      setError('');
      await api.post(`${base}/orders/${order.id}/status`, { status }, { headers: authHeaders(token) });
      await load();
      flash(status === 'SERVED' ? 'Order marked served.' : 'Bill sent for payment.');
    } catch (err) { setError(apiErrorMessage(err)); }
  }

  if (!assignments.length) {
    return <div className="waiter-page"><div className="waiter-empty"><UtensilsCrossed size={28}/><strong>No restaurant assignment</strong><span>Your account does not currently have an active waiter assignment.</span></div></div>;
  }

  const selectedTable = tables.find((table) => table.id === tableId);
  const selectedOrder = activeOrders.find((order) => order.id === targetOrderId);

  return <div className="waiter-page">
    <section className="waiter-head">
      <div><div className="waiter-kicker">TABLE SERVICE</div><h1>{branch?.name || 'Restaurant'}</h1><p>Take orders, update service status and hand bills to the cashier or manager for settlement.</p></div>
      <div className="waiter-head-actions">
        {assignments.length > 1 && <select value={membership?.membershipId || ''} onChange={(event) => setMembershipId(event.target.value)}>{assignments.map((row) => <option value={row.membershipId} key={row.membershipId}>{row.branch?.name} · {row.branch?.code}</option>)}</select>}
        <button onClick={load} disabled={busy}><RefreshCw size={15} className={busy ? 'spin' : ''}/>Refresh</button>
      </div>
    </section>

    {error && <div className="waiter-message error">{error}</div>}
    {notice && <div className="waiter-message success"><CheckCircle2 size={14}/>{notice}</div>}

    <section className="waiter-section">
      <div className="waiter-section-head"><div><span>FLOOR</span><h2>Choose a table</h2></div><small>{tables.length} tables</small></div>
      <div className="waiter-tables">{tables.map((table) => {
        const own = Boolean(table.activeOrder?.own);
        const occupied = Boolean(table.activeOrder?.occupied);
        const selected = table.id === tableId || (own && table.activeOrder?.id === targetOrderId);
        return <button key={table.id} className={`waiter-table ${own ? 'own' : occupied ? 'occupied' : 'available'} ${selected ? 'selected' : ''}`} onClick={() => selectTable(table)} disabled={occupied}>
          <div className="waiter-table-icon"><Table2 size={19}/></div><strong>{table.name}</strong><span>{table.code} · {table.seats} seats</span><small>{own ? `${table.activeOrder.orderNumber} · ${statusLabel(table.activeOrder.status)}` : occupied ? 'Occupied by another waiter' : 'Available'}</small>
        </button>;
      })}</div>
    </section>

    <div className="waiter-order-layout">
      <section className="waiter-section waiter-menu-panel">
        <div className="waiter-section-head"><div><span>MENU</span><h2>{selectedOrder ? `Add to ${selectedOrder.orderNumber}` : selectedTable ? `Order for ${selectedTable.name}` : 'Build order'}</h2></div><label className="waiter-search"><Search size={14}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search menu..."/></label></div>
        <div className="waiter-products">{filteredProducts.map((product) => <article className="waiter-product" key={product.id}>
          <div className="waiter-product-copy">{product.imageUrl ? <img src={product.imageUrl} alt=""/> : <div className="waiter-product-image">{product.productType === 'ALCOHOL' ? <Wine size={18}/> : <UtensilsCrossed size={18}/>}</div>}<div><strong>{product.name}</strong><span>{product.brand || product.productType}</span></div></div>
          <div className="waiter-price-list">{(product.priceOptions || []).map((price) => <button key={price.id} onClick={() => addItem(product, price)}><span>{price.label}</span><strong>{formatMoney(price.priceMinor)}</strong><Plus size={12}/></button>)}</div>
        </article>)}</div>
      </section>

      <aside className="waiter-section waiter-draft">
        <div className="waiter-section-head"><div><span>ORDER</span><h2>Current draft</h2></div><ShoppingBag size={18}/></div>
        {!draft.length ? <div className="waiter-empty compact"><ShoppingBag size={22}/><strong>No items yet</strong><span>Select a table, then tap menu prices to add items.</span></div> : <div className="waiter-draft-lines">{draft.map((row) => <div className="waiter-draft-line" key={row.priceOptionId}><div><strong>{row.productName}</strong><span>{row.priceLabel} · {formatMoney(row.priceMinor)}</span></div><div className="waiter-qty"><button onClick={() => quantity(row.priceOptionId, row.quantityUnits - 1)}><Minus size={11}/></button><span>{row.quantityUnits}</span><button onClick={() => quantity(row.priceOptionId, row.quantityUnits + 1)}><Plus size={11}/></button></div><strong>{formatMoney(BigInt(row.priceMinor || 0) * BigInt(row.quantityUnits))}</strong></div>)}</div>}
        <div className="waiter-total"><span>Total</span><strong>{formatMoney(draftTotal)}</strong></div>
        <button className="waiter-primary" onClick={submitOrder} disabled={busy || !draft.length || (!tableId && !targetOrderId)}>{targetOrderId ? 'Add items' : 'Open order'}<ChevronRight size={15}/></button>
      </aside>
    </div>

    <section className="waiter-section">
      <div className="waiter-section-head"><div><span>MY ORDERS</span><h2>Open table orders</h2></div><small>{activeOrders.length} active</small></div>
      {!activeOrders.length ? <div className="waiter-empty compact"><CheckCircle2 size={22}/><strong>No open orders</strong><span>Your active table orders will appear here.</span></div> : <div className="waiter-active-orders">{activeOrders.map((order) => <article key={order.id} className={`waiter-order status-${String(order.status).toLowerCase()}`}>
        <div className="waiter-order-top"><div><span>{statusLabel(order.status)}</span><strong>{order.orderNumber}</strong><small>{order.table?.name || 'Table'} · <Clock3 size={10}/> {new Date(order.createdAt).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</small></div><strong>{formatMoney(order.totalMinor)}</strong></div>
        <div className="waiter-order-lines">{(order.lines || []).filter((line) => line.status !== 'CANCELLED').map((line) => <div key={line.id}><span>{line.quantityUnits} × {line.productNameSnapshot} · {line.priceLabelSnapshot}</span><strong>{formatMoney(line.lineSubtotalMinor)}</strong></div>)}</div>
        <div className="waiter-order-actions"><button onClick={() => selectOwnOrder(order)}>Add items</button>{order.status === 'OPEN' && <button onClick={() => updateStatus(order, 'SERVED')}>Mark served</button>}{['OPEN','SERVED'].includes(order.status) && <button className="bill" onClick={() => updateStatus(order, 'AWAITING_PAYMENT')}>Request bill</button>}{order.status === 'AWAITING_PAYMENT' && <span className="waiter-awaiting"><Clock3 size={12}/>Awaiting cashier / manager payment</span>}</div>
      </article>)}</div>}
    </section>
  </div>;
}
