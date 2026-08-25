import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Boxes,
  Building2,
  ClipboardPlus,
  History,
  ImagePlus,
  PackagePlus,
  PackageSearch,
  Plus,
  RefreshCw,
  Scale,
  Store,
  Truck,
  Upload,
  Wine
} from 'lucide-react';
import { api, apiErrorMessage, authHeaders } from './api';
import './inventory.css';

function minorFromRupees(value) {
  const raw = String(value ?? '').trim();
  const match = raw.match(/^(\d+)(?:\.(\d{0,2}))?$/);
  if (!match) throw new Error('Enter a valid INR amount with up to 2 decimal places.');
  const whole = BigInt(match[1]);
  const paise = BigInt((match[2] || '').padEnd(2, '0') || '0');
  return (whole * 100n + paise).toString();
}

function rupeesFromMinor(value) {
  try {
    const amount = BigInt(value || 0);
    const negative = amount < 0n;
    const absolute = negative ? -amount : amount;
    const whole = absolute / 100n;
    const paise = String(absolute % 100n).padStart(2, '0');
    return `${negative ? '-' : ''}₹${whole.toLocaleString('en-IN')}.${paise}`;
  } catch (_) {
    return '₹0.00';
  }
}

function cleanQuantity(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '0';
  return number.toLocaleString('en-IN', { maximumFractionDigits: 3 });
}

function extractBalance(product) {
  return product?.inventoryBalances?.[0] || null;
}

const EMPTY_PRODUCT = {
  name: '', brand: '', sku: '', barcode: '', productType: 'ALCOHOL', inventoryUnit: 'ML', bottleVolumeMl: '750', categoryId: '',
  p30: '', p60: '', p90: '', pFull: '', customQty: '', customPrice: ''
};

function ScopeSelector({ token, access, scope, onChange }) {
  const isSuperAdmin = Boolean(access?.isSuperAdmin);
  const tenantAdmin = (access?.tenants || []).find((row) => row.role === 'TENANT_ADMIN');
  const staffBranches = access?.branches || [];
  const [tenants, setTenants] = useState([]);
  const [branches, setBranches] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        setError('');
        if (isSuperAdmin) {
          const { data } = await api.get('/platform/tenants', { headers: authHeaders(token) });
          if (cancelled) return;
          const rows = data.tenants || [];
          setTenants(rows);
          const tenantId = scope.tenantId || rows[0]?.id || '';
          if (tenantId) onChange({ tenantId, branchId: scope.branchId || '' });
          return;
        }
        if (tenantAdmin) {
          setTenants([tenantAdmin.tenant]);
          if (!scope.tenantId) onChange({ tenantId: tenantAdmin.tenantId, branchId: scope.branchId || '' });
          return;
        }
        const uniqueTenants = [];
        const seen = new Set();
        staffBranches.forEach((row) => {
          if (!seen.has(row.tenantId)) {
            seen.add(row.tenantId);
            uniqueTenants.push({ id: row.tenantId, name: row.branch?.tenantName || 'Assigned tenant' });
          }
        });
        setTenants(uniqueTenants);
        const tenantId = scope.tenantId || staffBranches[0]?.tenantId || '';
        const branchId = scope.branchId || staffBranches.find((row) => row.tenantId === tenantId)?.branchId || '';
        if (tenantId || branchId) onChange({ tenantId, branchId });
      } catch (err) {
        if (!cancelled) setError(apiErrorMessage(err));
      }
    }
    boot();
    return () => { cancelled = true; };
  }, [token, isSuperAdmin, tenantAdmin?.tenantId]);

  useEffect(() => {
    let cancelled = false;
    async function loadBranches() {
      if (!scope.tenantId) { setBranches([]); return; }
      try {
        if (!isSuperAdmin && !tenantAdmin) {
          const rows = staffBranches.filter((row) => row.tenantId === scope.tenantId).map((row) => row.branch).filter(Boolean);
          setBranches(rows);
          if (!scope.branchId && rows[0]?.id) onChange({ ...scope, branchId: rows[0].id });
          return;
        }
        const { data } = await api.get(`/tenants/${scope.tenantId}/branches`, { headers: authHeaders(token) });
        if (cancelled) return;
        const rows = data.branches || [];
        setBranches(rows);
        if ((!scope.branchId || !rows.some((row) => row.id === scope.branchId)) && rows[0]?.id) {
          onChange({ ...scope, branchId: rows[0].id });
        }
      } catch (err) {
        if (!cancelled) setError(apiErrorMessage(err));
      }
    }
    loadBranches();
    return () => { cancelled = true; };
  }, [scope.tenantId, token, isSuperAdmin, tenantAdmin?.tenantId]);

  return (
    <div className="inventory-scope-card">
      <div className="inventory-scope-copy"><div className="inventory-mini">Operating scope</div><strong>Select outlet</strong><span>Inventory is always isolated by tenant and branch.</span></div>
      <div className="inventory-scope-inputs">
        <label><span>Business</span><select value={scope.tenantId} onChange={(event) => onChange({ tenantId: event.target.value, branchId: '' })}>{!tenants.length && <option value="">No tenant</option>}{tenants.map((tenant) => <option value={tenant.id} key={tenant.id}>{tenant.name}</option>)}</select></label>
        <label><span>Outlet</span><select value={scope.branchId} onChange={(event) => onChange({ ...scope, branchId: event.target.value })}>{!branches.length && <option value="">No outlet</option>}{branches.map((branch) => <option value={branch.id} key={branch.id}>{branch.name} · {branch.code}</option>)}</select></label>
      </div>
      {error && <div className="inventory-inline-error">{error}</div>}
    </div>
  );
}

function InventoryMetric({ label, value, icon: Icon }) {
  return <div className="inventory-metric"><div><strong>{value}</strong><span>{label}</span></div><div className="inventory-metric-icon"><Icon size={17} /></div></div>;
}

function EmptyPanel({ icon: Icon = PackageSearch, title, body }) {
  return <div className="inventory-empty"><div><Icon size={20} /></div><strong>{title}</strong><span>{body}</span></div>;
}

export default function InventoryWorkspace({ token, access }) {
  const [scope, setScope] = useState({ tenantId: '', branchId: '' });
  const [tab, setTab] = useState('Stock');
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [movements, setMovements] = useState([]);
  const [summary, setSummary] = useState({ productCount: 0, stockedProducts: 0, movementCount: 0, purchaseCount: 0, inventoryValueMinor: '0' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [productForm, setProductForm] = useState(EMPTY_PRODUCT);
  const [categoryName, setCategoryName] = useState('');
  const [supplierForm, setSupplierForm] = useState({ name: '', phone: '', email: '', gstin: '' });
  const [purchaseForm, setPurchaseForm] = useState({ supplierId: '', invoiceNumber: '', purchaseDate: new Date().toISOString().slice(0, 10), notes: '', lines: [{ productId: '', packageCount: '1', packageSizeBaseUnits: '', lineTotalRupees: '' }] });
  const [adjustment, setAdjustment] = useState({ mode: 'ADJUSTMENT', productId: '', quantity: '', costRupees: '', reason: '' });

  const base = scope.tenantId && scope.branchId ? `/inventory/tenants/${scope.tenantId}/branches/${scope.branchId}` : '';

  async function loadAll({ quiet = false } = {}) {
    if (!base) return;
    try {
      if (!quiet) setLoading(true);
      setError('');
      const headers = authHeaders(token);
      const [productRes, categoryRes, supplierRes, purchaseRes, movementRes, summaryRes] = await Promise.all([
        api.get(`${base}/products`, { headers }),
        api.get(`${base}/categories`, { headers }),
        api.get(`${base}/suppliers`, { headers }),
        api.get(`${base}/purchases?limit=40`, { headers }),
        api.get(`${base}/movements?limit=100`, { headers }),
        api.get(`${base}/summary`, { headers })
      ]);
      setProducts(productRes.data.products || []);
      setCategories(categoryRes.data.categories || []);
      setSuppliers(supplierRes.data.suppliers || []);
      setPurchases(purchaseRes.data.purchases || []);
      setMovements(movementRes.data.movements || []);
      setSummary(summaryRes.data.summary || {});
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      if (!quiet) setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, [base]);

  const stockRows = useMemo(() => products.filter((product) => product.trackInventory), [products]);
  const activeBranchName = access?.branches?.find((row) => row.branchId === scope.branchId)?.branch?.name || '';

  function notify(message) {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2600);
  }

  async function createCategory(event) {
    event.preventDefault();
    if (!categoryName.trim()) return;
    try {
      setError('');
      await api.post(`${base}/categories`, { name: categoryName.trim() }, { headers: authHeaders(token) });
      setCategoryName('');
      await loadAll({ quiet: true });
      notify('Category saved.');
    } catch (err) { setError(apiErrorMessage(err)); }
  }

  async function createProduct(event) {
    event.preventDefault();
    try {
      setError('');
      const priceOptions = [];
      const pushPrice = (label, quantity, rupees) => {
        if (!String(rupees || '').trim()) return;
        priceOptions.push({ label, quantityBaseUnits: String(quantity), priceMinor: minorFromRupees(rupees), sortOrder: priceOptions.length });
      };
      if (productForm.productType === 'ALCOHOL') {
        pushPrice('30 ml', 30, productForm.p30);
        pushPrice('60 ml', 60, productForm.p60);
        pushPrice('90 ml', 90, productForm.p90);
        pushPrice('Full bottle', productForm.bottleVolumeMl, productForm.pFull);
        if (productForm.customQty && productForm.customPrice) pushPrice(`${productForm.customQty} ml`, productForm.customQty, productForm.customPrice);
      } else if (productForm.pFull) {
        pushPrice('Standard', 1, productForm.pFull);
      }

      await api.post(`${base}/products`, {
        name: productForm.name,
        brand: productForm.brand || null,
        sku: productForm.sku || null,
        barcode: productForm.barcode || null,
        categoryId: productForm.categoryId || null,
        productType: productForm.productType,
        inventoryUnit: productForm.productType === 'ALCOHOL' ? 'ML' : productForm.inventoryUnit,
        bottleVolumeMl: productForm.productType === 'ALCOHOL' ? productForm.bottleVolumeMl : null,
        trackInventory: true,
        priceOptions
      }, { headers: authHeaders(token) });
      setProductForm(EMPTY_PRODUCT);
      await loadAll({ quiet: true });
      notify('Product and branch pricing created.');
    } catch (err) { setError(err.message || apiErrorMessage(err)); }
  }

  async function uploadImage(productId, file) {
    if (!file) return;
    try {
      setError('');
      const body = new FormData();
      body.append('image', file);
      await api.post(`${base}/products/${productId}/image`, body, { headers: authHeaders(token) });
      await loadAll({ quiet: true });
      notify('Product image uploaded.');
    } catch (err) { setError(apiErrorMessage(err)); }
  }

  async function createSupplier(event) {
    event.preventDefault();
    try {
      setError('');
      await api.post(`${base}/suppliers`, supplierForm, { headers: authHeaders(token) });
      setSupplierForm({ name: '', phone: '', email: '', gstin: '' });
      await loadAll({ quiet: true });
      notify('Supplier added.');
    } catch (err) { setError(apiErrorMessage(err)); }
  }

  function updatePurchaseLine(index, patch) {
    setPurchaseForm((current) => ({ ...current, lines: current.lines.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line) }));
  }

  function addPurchaseLine() {
    setPurchaseForm((current) => ({ ...current, lines: [...current.lines, { productId: '', packageCount: '1', packageSizeBaseUnits: '', lineTotalRupees: '' }] }));
  }

  function removePurchaseLine(index) {
    setPurchaseForm((current) => ({ ...current, lines: current.lines.filter((_, lineIndex) => lineIndex !== index) }));
  }

  async function postPurchase(event) {
    event.preventDefault();
    try {
      setError('');
      const lines = purchaseForm.lines.map((line) => {
        const product = products.find((row) => row.id === line.productId);
        const defaultSize = product?.productType === 'ALCOHOL' ? product.bottleVolumeMl : product?.inventoryUnit === 'PIECE' ? '1' : '';
        return {
          productId: line.productId,
          packageCount: line.packageCount,
          packageSizeBaseUnits: line.packageSizeBaseUnits || defaultSize,
          lineTotalMinor: minorFromRupees(line.lineTotalRupees)
        };
      });
      await api.post(`${base}/purchases`, {
        supplierId: purchaseForm.supplierId || null,
        invoiceNumber: purchaseForm.invoiceNumber || null,
        purchaseDate: purchaseForm.purchaseDate,
        notes: purchaseForm.notes || null,
        lines,
        idempotencyKey: crypto.randomUUID()
      }, { headers: authHeaders(token) });
      setPurchaseForm({ supplierId: '', invoiceNumber: '', purchaseDate: new Date().toISOString().slice(0, 10), notes: '', lines: [{ productId: '', packageCount: '1', packageSizeBaseUnits: '', lineTotalRupees: '' }] });
      await loadAll({ quiet: true });
      setTab('Stock');
      notify('Purchase posted and stock updated.');
    } catch (err) { setError(err.message || apiErrorMessage(err)); }
  }

  async function postAdjustment(event) {
    event.preventDefault();
    try {
      setError('');
      const key = crypto.randomUUID();
      if (adjustment.mode === 'WASTAGE') {
        await api.post(`${base}/wastage`, {
          productId: adjustment.productId,
          quantityBase: adjustment.quantity,
          reason: adjustment.reason,
          idempotencyKey: key
        }, { headers: authHeaders(token) });
      } else {
        const delta = adjustment.quantity;
        await api.post(`${base}/adjustments`, {
          productId: adjustment.productId,
          quantityDeltaBase: delta,
          costAmountMinor: Number(delta) > 0 && adjustment.costRupees ? minorFromRupees(adjustment.costRupees) : null,
          reason: adjustment.reason,
          idempotencyKey: key
        }, { headers: authHeaders(token) });
      }
      setAdjustment({ mode: 'ADJUSTMENT', productId: '', quantity: '', costRupees: '', reason: '' });
      await loadAll({ quiet: true });
      notify('Inventory movement posted.');
    } catch (err) { setError(err.message || apiErrorMessage(err)); }
  }

  const tabs = [
    { label: 'Stock', icon: Boxes },
    { label: 'Products', icon: Wine },
    { label: 'Purchases', icon: PackagePlus },
    { label: 'Adjustments', icon: Scale },
    { label: 'Suppliers', icon: Truck },
    { label: 'History', icon: History }
  ];

  if (!scope.tenantId || !scope.branchId) {
    return <div className="inventory-page"><ScopeSelector token={token} access={access} scope={scope} onChange={setScope} /><EmptyPanel icon={Store} title="Select an outlet" body="Create or choose a branch before managing inventory." /></div>;
  }

  return (
    <div className="inventory-page">
      <div className="inventory-hero">
        <div><div className="inventory-mini">Ledger-backed stock control</div><h2>Inventory Workbench</h2><p>Control products, purchase receipts, ML portions, adjustments and branch stock without bypassing the inventory ledger.</p></div>
        <button className="scorm-button-secondary" onClick={() => loadAll()} disabled={loading}><RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh</button>
      </div>

      <ScopeSelector token={token} access={access} scope={scope} onChange={setScope} />
      {activeBranchName && <div className="inventory-branch-note"><Store size={14} /> Working in {activeBranchName}</div>}
      {error && <div className="inventory-error">{error}</div>}
      {notice && <div className="inventory-notice">{notice}</div>}

      <div className="inventory-metrics">
        <InventoryMetric label="Products" value={summary.productCount || 0} icon={Wine} />
        <InventoryMetric label="In stock" value={summary.stockedProducts || 0} icon={Boxes} />
        <InventoryMetric label="Purchases" value={summary.purchaseCount || 0} icon={PackagePlus} />
        <InventoryMetric label="Movements" value={summary.movementCount || 0} icon={History} />
        <InventoryMetric label="Inventory value" value={rupeesFromMinor(summary.inventoryValueMinor)} icon={Scale} />
      </div>

      <div className="inventory-tabs">{tabs.map(({ label, icon: Icon }) => <button key={label} className={tab === label ? 'is-active' : ''} onClick={() => setTab(label)}><Icon size={15} /><span>{label}</span></button>)}</div>

      {tab === 'Stock' && (
        <section className="inventory-panel">
          <div className="inventory-panel-head"><div><div className="inventory-mini">Live branch balance</div><h3>Stock on hand</h3></div><span>{stockRows.length} products</span></div>
          {!stockRows.length ? <EmptyPanel title="No stock yet" body="Create products and post a purchase to build the first inventory balance." /> : <div className="inventory-table-wrap"><table><thead><tr><th>Product</th><th>Pricing</th><th>Stock</th><th>Avg cost / unit</th><th>Inventory value</th></tr></thead><tbody>{stockRows.map((product) => { const balance = extractBalance(product); return <tr key={product.id}><td><div className="product-cell">{product.imageUrl ? <img src={product.imageUrl} alt="" /> : <div className="product-placeholder"><Wine size={16} /></div>}<div><strong>{product.name}</strong><span>{product.brand || 'No brand'} · {product.sku || 'No SKU'}</span></div></div></td><td><div className="price-chips">{(product.priceOptions || []).slice(0, 4).map((price) => <span key={price.id}>{price.label} {rupeesFromMinor(price.priceMinor)}</span>)}</div></td><td><strong>{cleanQuantity(balance?.quantityBase || 0)} {product.inventoryUnit}</strong></td><td>{rupeesFromMinor(balance ? String(Math.round(Number(balance.weightedAverageCostMinorPerUnit || 0))) : '0')}</td><td><strong>{rupeesFromMinor(balance?.inventoryValueMinor || '0')}</strong></td></tr>; })}</tbody></table></div>}
        </section>
      )}

      {tab === 'Products' && (
        <div className="inventory-two-column">
          <form className="inventory-panel inventory-form" onSubmit={createProduct}>
            <div className="inventory-panel-head"><div><div className="inventory-mini">Catalogue</div><h3>Create product</h3></div><PackagePlus size={18} /></div>
            <div className="form-grid two"><label><span>Name</span><input value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} required placeholder="Johnnie Walker Black Label" /></label><label><span>Brand</span><input value={productForm.brand} onChange={(e) => setProductForm({ ...productForm, brand: e.target.value })} placeholder="Johnnie Walker" /></label></div>
            <div className="form-grid two"><label><span>SKU</span><input value={productForm.sku} onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })} placeholder="JW-BLACK-750" /></label><label><span>Barcode</span><input value={productForm.barcode} onChange={(e) => setProductForm({ ...productForm, barcode: e.target.value })} placeholder="Optional" /></label></div>
            <div className="form-grid two"><label><span>Type</span><select value={productForm.productType} onChange={(e) => setProductForm({ ...productForm, productType: e.target.value, inventoryUnit: e.target.value === 'ALCOHOL' ? 'ML' : 'PIECE' })}><option>ALCOHOL</option><option>FOOD</option><option>MIXER</option><option>OTHER</option></select></label><label><span>Category</span><select value={productForm.categoryId} onChange={(e) => setProductForm({ ...productForm, categoryId: e.target.value })}><option value="">Uncategorised</option>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label></div>
            {productForm.productType === 'ALCOHOL' ? <label><span>Bottle volume (ML)</span><input type="number" min="1" step="1" value={productForm.bottleVolumeMl} onChange={(e) => setProductForm({ ...productForm, bottleVolumeMl: e.target.value })} required /></label> : <label><span>Inventory unit</span><select value={productForm.inventoryUnit} onChange={(e) => setProductForm({ ...productForm, inventoryUnit: e.target.value })}><option>PIECE</option><option>GRAM</option><option>ML</option></select></label>}
            <div className="inventory-subhead">Branch selling prices <span>enter INR, prices are explicit—not derived from bottle price</span></div>
            {productForm.productType === 'ALCOHOL' ? <><div className="form-grid four"><label><span>30 ml ₹</span><input value={productForm.p30} onChange={(e) => setProductForm({ ...productForm, p30: e.target.value })} inputMode="decimal" /></label><label><span>60 ml ₹</span><input value={productForm.p60} onChange={(e) => setProductForm({ ...productForm, p60: e.target.value })} inputMode="decimal" /></label><label><span>90 ml ₹</span><input value={productForm.p90} onChange={(e) => setProductForm({ ...productForm, p90: e.target.value })} inputMode="decimal" /></label><label><span>Full bottle ₹</span><input value={productForm.pFull} onChange={(e) => setProductForm({ ...productForm, pFull: e.target.value })} inputMode="decimal" /></label></div><div className="form-grid two"><label><span>Custom ML</span><input value={productForm.customQty} onChange={(e) => setProductForm({ ...productForm, customQty: e.target.value })} inputMode="decimal" placeholder="e.g. 100" /></label><label><span>Custom price ₹</span><input value={productForm.customPrice} onChange={(e) => setProductForm({ ...productForm, customPrice: e.target.value })} inputMode="decimal" /></label></div></> : <label><span>Standard selling price ₹</span><input value={productForm.pFull} onChange={(e) => setProductForm({ ...productForm, pFull: e.target.value })} inputMode="decimal" /></label>}
            <button className="scorm-button-primary inventory-submit"><Plus size={14} /> Create product</button>
          </form>

          <div className="inventory-panel">
            <div className="inventory-panel-head"><div><div className="inventory-mini">Product library</div><h3>{products.length} products</h3></div></div>
            <form className="inline-create" onSubmit={createCategory}><input value={categoryName} onChange={(e) => setCategoryName(e.target.value)} placeholder="New category" /><button className="scorm-button-secondary"><Plus size={13} /> Category</button></form>
            <div className="product-list">{!products.length && <EmptyPanel title="No products yet" body="Create the first inventory item for this tenant." />}{products.map((product) => <div className="product-list-row" key={product.id}><div className="product-cell">{product.imageUrl ? <img src={product.imageUrl} alt="" /> : <div className="product-placeholder"><Wine size={16} /></div>}<div><strong>{product.name}</strong><span>{product.productType} · {product.inventoryUnit}{product.bottleVolumeMl ? ` · ${cleanQuantity(product.bottleVolumeMl)} ML bottle` : ''}</span><div className="price-chips">{(product.priceOptions || []).map((price) => <span key={price.id}>{price.label} {rupeesFromMinor(price.priceMinor)}</span>)}</div></div></div><label className="image-upload"><ImagePlus size={14} /><span>Image</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => uploadImage(product.id, event.target.files?.[0])} /></label></div>)}</div>
          </div>
        </div>
      )}

      {tab === 'Purchases' && (
        <div className="inventory-two-column purchase-layout">
          <form className="inventory-panel inventory-form" onSubmit={postPurchase}>
            <div className="inventory-panel-head"><div><div className="inventory-mini">Goods received</div><h3>Post purchase</h3></div><ClipboardPlus size={18} /></div>
            <div className="form-grid two"><label><span>Supplier</span><select value={purchaseForm.supplierId} onChange={(e) => setPurchaseForm({ ...purchaseForm, supplierId: e.target.value })}><option value="">No supplier</option>{suppliers.map((supplier) => <option value={supplier.id} key={supplier.id}>{supplier.name}</option>)}</select></label><label><span>Invoice number</span><input value={purchaseForm.invoiceNumber} onChange={(e) => setPurchaseForm({ ...purchaseForm, invoiceNumber: e.target.value })} placeholder="INV-001" /></label></div>
            <label><span>Purchase date</span><input type="date" value={purchaseForm.purchaseDate} onChange={(e) => setPurchaseForm({ ...purchaseForm, purchaseDate: e.target.value })} required /></label>
            <div className="purchase-lines">{purchaseForm.lines.map((line, index) => { const product = products.find((row) => row.id === line.productId); return <div className="purchase-line" key={index}><div className="purchase-line-number">{index + 1}</div><div className="purchase-line-fields"><label><span>Product</span><select value={line.productId} onChange={(e) => updatePurchaseLine(index, { productId: e.target.value, packageSizeBaseUnits: '' })} required><option value="">Select product</option>{products.filter((row) => row.trackInventory).map((row) => <option value={row.id} key={row.id}>{row.name}</option>)}</select></label><div className="form-grid three"><label><span>{product?.productType === 'ALCOHOL' ? 'Bottles' : 'Packages'}</span><input type="number" min="0.001" step="0.001" value={line.packageCount} onChange={(e) => updatePurchaseLine(index, { packageCount: e.target.value })} required /></label><label><span>Size / package</span><input type="number" min="0.001" step="0.001" value={line.packageSizeBaseUnits} onChange={(e) => updatePurchaseLine(index, { packageSizeBaseUnits: e.target.value })} placeholder={product?.bottleVolumeMl || (product?.inventoryUnit === 'PIECE' ? '1' : 'Required')} /></label><label><span>Line cost ₹</span><input value={line.lineTotalRupees} onChange={(e) => updatePurchaseLine(index, { lineTotalRupees: e.target.value })} inputMode="decimal" required /></label></div></div>{purchaseForm.lines.length > 1 && <button type="button" className="remove-line" onClick={() => removePurchaseLine(index)}>×</button>}</div>; })}</div>
            <button type="button" className="scorm-button-secondary add-line" onClick={addPurchaseLine}><Plus size={13} /> Add line</button>
            <label><span>Notes</span><textarea rows="3" value={purchaseForm.notes} onChange={(e) => setPurchaseForm({ ...purchaseForm, notes: e.target.value })} placeholder="Optional receiving note" /></label>
            <button className="scorm-button-primary inventory-submit"><Upload size={14} /> Post purchase & receive stock</button>
          </form>
          <div className="inventory-panel"><div className="inventory-panel-head"><div><div className="inventory-mini">Recent receipts</div><h3>Purchases</h3></div><span>{purchases.length}</span></div><div className="history-list">{!purchases.length && <EmptyPanel title="No purchases" body="Posted purchase receipts will appear here." />}{purchases.map((purchase) => <div className="history-row" key={purchase.id}><div><strong>{purchase.invoiceNumber || 'Purchase receipt'}</strong><span>{purchase.supplier?.name || 'No supplier'} · {purchase.purchaseDate}</span></div><div><strong>{rupeesFromMinor(purchase.totalMinor)}</strong><span>{purchase.lines?.length || 0} lines</span></div></div>)}</div></div>
        </div>
      )}

      {tab === 'Adjustments' && (
        <div className="inventory-two-column compact-layout">
          <form className="inventory-panel inventory-form" onSubmit={postAdjustment}>
            <div className="inventory-panel-head"><div><div className="inventory-mini">Controlled movement</div><h3>Stock adjustment</h3></div><Scale size={18} /></div>
            <div className="adjustment-mode"><button type="button" className={adjustment.mode === 'ADJUSTMENT' ? 'is-active' : ''} onClick={() => setAdjustment({ ...adjustment, mode: 'ADJUSTMENT' })}>Adjustment</button><button type="button" className={adjustment.mode === 'WASTAGE' ? 'is-active' : ''} onClick={() => setAdjustment({ ...adjustment, mode: 'WASTAGE', costRupees: '' })}>Wastage / spillage</button></div>
            <label><span>Product</span><select value={adjustment.productId} onChange={(e) => setAdjustment({ ...adjustment, productId: e.target.value })} required><option value="">Select product</option>{products.filter((row) => row.trackInventory).map((row) => <option value={row.id} key={row.id}>{row.name}</option>)}</select></label>
            <label><span>{adjustment.mode === 'WASTAGE' ? 'Quantity removed' : 'Quantity delta (+ add / - remove)'}</span><input type="number" step="0.001" min={adjustment.mode === 'WASTAGE' ? '0.001' : undefined} value={adjustment.quantity} onChange={(e) => setAdjustment({ ...adjustment, quantity: e.target.value })} required placeholder={adjustment.mode === 'WASTAGE' ? 'e.g. 60' : 'e.g. -30 or 750'} /></label>
            {adjustment.mode === 'ADJUSTMENT' && Number(adjustment.quantity) > 0 && <label><span>Added stock cost ₹ <small>optional when existing average cost can be used</small></span><input value={adjustment.costRupees} onChange={(e) => setAdjustment({ ...adjustment, costRupees: e.target.value })} inputMode="decimal" /></label>}
            <label><span>Reason</span><textarea rows="4" value={adjustment.reason} onChange={(e) => setAdjustment({ ...adjustment, reason: e.target.value })} required placeholder="Physical stock count correction, bottle breakage, spillage..." /></label>
            <button className="scorm-button-primary inventory-submit"><ArrowRight size={14} /> Post movement</button>
          </form>
          <div className="inventory-panel inventory-guidance"><div className="inventory-mini">Ledger rule</div><h3>Stock never changes silently</h3><p>Purchases, wastage and manual corrections always create an immutable movement record. Outgoing movements use the current weighted-average cost and cannot take the branch below zero stock.</p><div className="guidance-callout"><Scale size={16} /><span>For alcohol, all quantities are stored in ML. A 30 ml pour is exactly −30 ML; a full 750 ml bottle is −750 ML.</span></div></div>
        </div>
      )}

      {tab === 'Suppliers' && (
        <div className="inventory-two-column compact-layout">
          <form className="inventory-panel inventory-form" onSubmit={createSupplier}><div className="inventory-panel-head"><div><div className="inventory-mini">Vendor master</div><h3>Add supplier</h3></div><Truck size={18} /></div><label><span>Name</span><input value={supplierForm.name} onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })} required /></label><div className="form-grid two"><label><span>Phone</span><input value={supplierForm.phone} onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })} /></label><label><span>Email</span><input type="email" value={supplierForm.email} onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })} /></label></div><label><span>GSTIN</span><input value={supplierForm.gstin} onChange={(e) => setSupplierForm({ ...supplierForm, gstin: e.target.value })} /></label><button className="scorm-button-primary inventory-submit"><Plus size={14} /> Add supplier</button></form>
          <div className="inventory-panel"><div className="inventory-panel-head"><div><div className="inventory-mini">Approved vendors</div><h3>Suppliers</h3></div><span>{suppliers.length}</span></div><div className="history-list">{!suppliers.length && <EmptyPanel icon={Truck} title="No suppliers" body="Add suppliers before recording vendor-linked purchases." />}{suppliers.map((supplier) => <div className="history-row" key={supplier.id}><div><strong>{supplier.name}</strong><span>{supplier.gstin || 'No GSTIN'}</span></div><div><strong>{supplier.phone || '—'}</strong><span>{supplier.email || 'No email'}</span></div></div>)}</div></div>
        </div>
      )}

      {tab === 'History' && (
        <section className="inventory-panel"><div className="inventory-panel-head"><div><div className="inventory-mini">Immutable ledger</div><h3>Stock movement history</h3></div><span>{movements.length} latest</span></div>{!movements.length ? <EmptyPanel icon={History} title="No movements" body="Purchases and adjustments will appear here." /> : <div className="inventory-table-wrap"><table><thead><tr><th>Time</th><th>Product</th><th>Movement</th><th>Quantity</th><th>Cost effect</th><th>Stock after</th><th>Reason</th></tr></thead><tbody>{movements.map((movement) => <tr key={movement.id}><td>{new Date(movement.createdAt).toLocaleString('en-IN')}</td><td><strong>{movement.product?.name || 'Product'}</strong></td><td><span className={`movement-pill ${Number(movement.quantityDeltaBase) >= 0 ? 'in' : 'out'}`}>{movement.movementType}</span></td><td><strong>{Number(movement.quantityDeltaBase) > 0 ? '+' : ''}{cleanQuantity(movement.quantityDeltaBase)} {movement.product?.inventoryUnit}</strong></td><td>{rupeesFromMinor(movement.costAmountMinor)}</td><td>{cleanQuantity(movement.stockAfterBase)}</td><td>{movement.reason || '—'}</td></tr>)}</tbody></table></div>}</section>
      )}
    </div>
  );
}
