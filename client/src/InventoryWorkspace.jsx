import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  ArrowRight,
  Boxes,
  ClipboardCheck,
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
  Wine,
} from "lucide-react";
import { api, apiErrorMessage, authHeaders } from "./api";
import "./inventory.css";

function minorFromRupees(value) {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d+)(?:\.(\d{0,2}))?$/);
  if (!match)
    throw new Error("Enter a valid amount with up to 2 decimal places.");
  return (
    BigInt(match[1]) * 100n +
    BigInt((match[2] || "").padEnd(2, "0") || "0")
  ).toString();
}
function rupeesFromMinor(value) {
  try {
    const amount = BigInt(value || 0);
    const negative = amount < 0n;
    const absolute = negative ? -amount : amount;
    return `${negative ? "-" : ""}₹${(absolute / 100n).toLocaleString("en-IN")}.${String(absolute % 100n).padStart(2, "0")}`;
  } catch (_) {
    return "₹0.00";
  }
}
function cleanQuantity(value) {
  const number = Number(value || 0);
  return Number.isFinite(number)
    ? number.toLocaleString("en-IN", { maximumFractionDigits: 3 })
    : "0";
}
function extractBalance(product) {
  return product?.inventoryBalances?.[0] || null;
}

const EMPTY_PRODUCT = {
  name: "",
  brand: "",
  sku: "",
  barcode: "",
  productType: "ALCOHOL",
  inventoryUnit: "ML",
  bottleVolumeMl: "750",
  categoryId: "",
  p30: "",
  p60: "",
  p90: "",
  pFull: "",
  customQty: "",
  customPrice: "",
};
const EMPTY_PURCHASE_LINE = {
  productId: "",
  packageCount: "1",
  packageSizeBaseUnits: "",
  lineTotalRupees: "",
  batchNumber: "",
  manufacturedAt: "",
  expiresAt: "",
  mrpRupees: "",
  packageLabel: "",
};

function ScopeSelector({ token, access, scope, onChange }) {
  const isSuperAdmin = Boolean(access?.isSuperAdmin);
  const tenantAdmin = (access?.tenants || []).find(
    (row) => row.role === "TENANT_ADMIN",
  );
  const staffBranches = access?.branches || [];
  const [tenants, setTenants] = useState([]);
  const [branches, setBranches] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        setError("");
        if (isSuperAdmin) {
          const { data } = await api.get("/platform/tenants", {
            headers: authHeaders(token),
          });
          if (cancelled) return;
          const rows = data.tenants || [];
          setTenants(rows);
          const tenantId = scope.tenantId || rows[0]?.id || "";
          if (tenantId) onChange({ tenantId, branchId: scope.branchId || "" });
          return;
        }
        if (tenantAdmin) {
          setTenants(
            tenantAdmin.tenant
              ? [tenantAdmin.tenant]
              : [{ id: tenantAdmin.tenantId, name: "Assigned business" }],
          );
          if (!scope.tenantId)
            onChange({
              tenantId: tenantAdmin.tenantId,
              branchId: scope.branchId || "",
            });
          return;
        }
        const uniqueTenants = [];
        const seen = new Set();
        staffBranches.forEach((row) => {
          if (!seen.has(row.tenantId)) {
            seen.add(row.tenantId);
            uniqueTenants.push({
              id: row.tenantId,
              name: row.branch?.tenantName || "Assigned business",
            });
          }
        });
        setTenants(uniqueTenants);
        const tenantId = scope.tenantId || staffBranches[0]?.tenantId || "";
        const branchId =
          scope.branchId ||
          staffBranches.find((row) => row.tenantId === tenantId)?.branchId ||
          "";
        if (tenantId || branchId) onChange({ tenantId, branchId });
      } catch (err) {
        if (!cancelled) setError(apiErrorMessage(err));
      }
    }
    boot();
    return () => {
      cancelled = true;
    };
  }, [token, isSuperAdmin, tenantAdmin?.tenantId]);

  useEffect(() => {
    let cancelled = false;
    async function loadBranches() {
      if (!scope.tenantId) {
        setBranches([]);
        return;
      }
      try {
        if (!isSuperAdmin && !tenantAdmin) {
          const rows = staffBranches
            .filter((row) => row.tenantId === scope.tenantId)
            .map((row) => row.branch)
            .filter(Boolean);
          setBranches(rows);
          if (!scope.branchId && rows[0]?.id)
            onChange({ ...scope, branchId: rows[0].id });
          return;
        }
        const { data } = await api.get(`/tenants/${scope.tenantId}/branches`, {
          headers: authHeaders(token),
        });
        if (cancelled) return;
        const rows = data.branches || [];
        setBranches(rows);
        if (
          (!scope.branchId || !rows.some((row) => row.id === scope.branchId)) &&
          rows[0]?.id
        )
          onChange({ ...scope, branchId: rows[0].id });
      } catch (err) {
        if (!cancelled) setError(apiErrorMessage(err));
      }
    }
    loadBranches();
    return () => {
      cancelled = true;
    };
  }, [scope.tenantId, token, isSuperAdmin, tenantAdmin?.tenantId]);

  return (
    <div className="inventory-scope-card">
      <div className="inventory-scope-copy">
        <div className="inventory-mini">Branch</div>
        <strong>Where are you working?</strong>
        <span>Choose the branch whose stock you want to see or update.</span>
      </div>
      <div className="inventory-scope-inputs">
        <label>
          <span>Business</span>
          <select
            value={scope.tenantId}
            onChange={(e) =>
              onChange({ tenantId: e.target.value, branchId: "" })
            }
          >
            {!tenants.length && <option value="">No business</option>}
            {tenants.map((row) => (
              <option value={row.id} key={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Branch</span>
          <select
            value={scope.branchId}
            onChange={(e) => onChange({ ...scope, branchId: e.target.value })}
          >
            {!branches.length && <option value="">No branch</option>}
            {branches.map((row) => (
              <option value={row.id} key={row.id}>
                {row.name} · {row.code}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && <div className="inventory-inline-error">{error}</div>}
    </div>
  );
}

function InventoryMetric({ label, value, icon: Icon }) {
  return (
    <div className="inventory-metric">
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
      <div className="inventory-metric-icon">
        <Icon size={17} />
      </div>
    </div>
  );
}
function EmptyPanel({ icon: Icon = PackageSearch, title, body }) {
  return (
    <div className="inventory-empty">
      <div>
        <Icon size={20} />
      </div>
      <strong>{title}</strong>
      <span>{body}</span>
    </div>
  );
}

export default function InventoryWorkspace({ token, access }) {
  const [scope, setScope] = useState({ tenantId: "", branchId: "" });
  const [tab, setTab] = useState("Stock");
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [movements, setMovements] = useState([]);
  const [stocktakes, setStocktakes] = useState([]);
  const [batches, setBatches] = useState([]);
  const [transferOrders, setTransferOrders] = useState([]);
  const [supplierReturns, setSupplierReturns] = useState([]);
  const [transferBranches, setTransferBranches] = useState([]);
  const [summary, setSummary] = useState({
    productCount: 0,
    stockedProducts: 0,
    movementCount: 0,
    purchaseCount: 0,
    inventoryValueMinor: "0",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [productForm, setProductForm] = useState(EMPTY_PRODUCT);
  const [categoryName, setCategoryName] = useState("");
  const [supplierForm, setSupplierForm] = useState({
    name: "",
    phone: "",
    email: "",
    gstin: "",
  });
  const [purchaseForm, setPurchaseForm] = useState({
    supplierId: "",
    invoiceNumber: "",
    purchaseDate: new Date().toISOString().slice(0, 10),
    notes: "",
    lines: [{ ...EMPTY_PURCHASE_LINE }],
  });
  const [adjustment, setAdjustment] = useState({
    mode: "ADJUSTMENT",
    productId: "",
    quantity: "",
    costRupees: "",
    reason: "",
  });
  const [transfer, setTransfer] = useState({
    destinationBranchId: "",
    productId: "",
    quantityBase: "",
    reason: "",
  });
  const [supplierReturn, setSupplierReturn] = useState({
    supplierId: "",
    productId: "",
    batchId: "",
    quantityBase: "",
    creditRupees: "",
    reason: "",
  });
  const [stocktakeForm, setStocktakeForm] = useState({
    name: `Physical count ${new Date().toLocaleDateString("en-IN")}`,
    notes: "",
  });
  const [stocktakeCounts, setStocktakeCounts] = useState({});
  const base =
    scope.tenantId && scope.branchId
      ? `/inventory/tenants/${scope.tenantId}/branches/${scope.branchId}`
      : "";

  useEffect(() => {
    let cancelled = false;
    async function loadTransferBranches() {
      if (!scope.tenantId) {
        setTransferBranches([]);
        return;
      }
      try {
        const tenantAdmin = (access?.tenants || []).some(
          (row) =>
            row.tenantId === scope.tenantId && row.role === "TENANT_ADMIN",
        );
        let rows = [];
        if (tenantAdmin) {
          const { data } = await api.get(
            `/tenants/${scope.tenantId}/branches`,
            { headers: authHeaders(token) },
          );
          rows = data.branches || [];
        } else {
          rows = (access?.branches || [])
            .filter(
              (row) =>
                row.tenantId === scope.tenantId &&
                ["BRANCH_MANAGER", "INVENTORY_MANAGER"].includes(row.role),
            )
            .map((row) => row.branch)
            .filter(Boolean);
        }
        if (!cancelled)
          setTransferBranches(
            rows.filter(
              (row) => row.id !== scope.branchId && row.status !== "SUSPENDED",
            ),
          );
      } catch (err) {
        if (!cancelled) setError(apiErrorMessage(err));
      }
    }
    loadTransferBranches();
    return () => {
      cancelled = true;
    };
  }, [scope.tenantId, scope.branchId, token, access]);

  async function loadAll({ quiet = false } = {}) {
    if (!base) return;
    try {
      if (!quiet) setLoading(true);
      setError("");
      const headers = authHeaders(token);
      const [
        productRes,
        categoryRes,
        supplierRes,
        purchaseRes,
        movementRes,
        summaryRes,
        stocktakeRes,
        batchRes,
        transferRes,
        returnRes,
      ] = await Promise.all([
        api.get(`${base}/products`, { headers }),
        api.get(`${base}/categories`, { headers }),
        api.get(`${base}/suppliers`, { headers }),
        api.get(`${base}/purchases?limit=40`, { headers }),
        api.get(`${base}/movements?limit=100`, { headers }),
        api.get(`${base}/summary`, { headers }),
        api.get(`${base}/stocktakes?limit=30`, { headers }),
        api.get(`${base}/batches`, { headers }),
        api.get(`${base}/transfer-orders`, { headers }),
        api.get(`${base}/supplier-returns`, { headers }),
      ]);
      setProducts(productRes.data.products || []);
      setCategories(categoryRes.data.categories || []);
      setSuppliers(supplierRes.data.suppliers || []);
      setPurchases(purchaseRes.data.purchases || []);
      setMovements(movementRes.data.movements || []);
      setSummary(summaryRes.data.summary || {});
      setStocktakes(stocktakeRes.data.stocktakes || []);
      setBatches(batchRes.data.batches || []);
      setTransferOrders(transferRes.data.transfers || []);
      setSupplierReturns(returnRes.data.returns || []);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      if (!quiet) setLoading(false);
    }
  }
  useEffect(() => {
    loadAll();
  }, [base]);
  const stockRows = useMemo(
    () => products.filter((p) => p.trackInventory),
    [products],
  );
  const activeStocktake = useMemo(
    () =>
      stocktakes.find((row) =>
        ["COUNTING", "SUBMITTED"].includes(row.status),
      ) || null,
    [stocktakes],
  );
  const activeBranchName =
    access?.branches?.find((row) => row.branchId === scope.branchId)?.branch
      ?.name || "";
  function notify(message) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2600);
  }

  async function createCategory(event) {
    event.preventDefault();
    if (!categoryName.trim()) return;
    try {
      setError("");
      await api.post(
        `${base}/categories`,
        { name: categoryName.trim() },
        { headers: authHeaders(token) },
      );
      setCategoryName("");
      await loadAll({ quiet: true });
      notify("Category saved.");
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function createProduct(event) {
    event.preventDefault();
    try {
      setError("");
      const priceOptions = [];
      const pushPrice = (label, quantity, rupees) => {
        if (!String(rupees || "").trim()) return;
        priceOptions.push({
          label,
          quantityBaseUnits: String(quantity),
          priceMinor: minorFromRupees(rupees),
          sortOrder: priceOptions.length,
        });
      };
      if (productForm.productType === "ALCOHOL") {
        pushPrice("30 ml", 30, productForm.p30);
        pushPrice("60 ml", 60, productForm.p60);
        pushPrice("90 ml", 90, productForm.p90);
        pushPrice("Full bottle", productForm.bottleVolumeMl, productForm.pFull);
        if (productForm.customQty && productForm.customPrice)
          pushPrice(
            `${productForm.customQty} ml`,
            productForm.customQty,
            productForm.customPrice,
          );
      } else if (productForm.pFull) {
        pushPrice("Standard", 1, productForm.pFull);
      }
      await api.post(
        `${base}/products`,
        {
          name: productForm.name,
          brand: productForm.brand || null,
          sku: productForm.sku || null,
          barcode: productForm.barcode || null,
          categoryId: productForm.categoryId || null,
          productType: productForm.productType,
          inventoryUnit:
            productForm.productType === "ALCOHOL"
              ? "ML"
              : productForm.inventoryUnit,
          bottleVolumeMl:
            productForm.productType === "ALCOHOL"
              ? productForm.bottleVolumeMl
              : null,
          trackInventory: true,
          priceOptions,
        },
        { headers: authHeaders(token) },
      );
      setProductForm(EMPTY_PRODUCT);
      await loadAll({ quiet: true });
      notify("Item added.");
    } catch (err) {
      setError(err.message || apiErrorMessage(err));
    }
  }

  async function uploadImage(productId, file) {
    if (!file) return;
    try {
      setError("");
      const body = new FormData();
      body.append("image", file);
      await api.post(`${base}/products/${productId}/image`, body, {
        headers: authHeaders(token),
      });
      await loadAll({ quiet: true });
      notify("Image added.");
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }
  async function createSupplier(event) {
    event.preventDefault();
    try {
      setError("");
      await api.post(`${base}/suppliers`, supplierForm, {
        headers: authHeaders(token),
      });
      setSupplierForm({ name: "", phone: "", email: "", gstin: "" });
      await loadAll({ quiet: true });
      notify("Supplier added.");
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }
  function updatePurchaseLine(index, patch) {
    setPurchaseForm((current) => ({
      ...current,
      lines: current.lines.map((line, i) =>
        i === index ? { ...line, ...patch } : line,
      ),
    }));
  }
  function addPurchaseLine() {
    setPurchaseForm((current) => ({
      ...current,
      lines: [...current.lines, { ...EMPTY_PURCHASE_LINE }],
    }));
  }
  function removePurchaseLine(index) {
    setPurchaseForm((current) => ({
      ...current,
      lines: current.lines.filter((_, i) => i !== index),
    }));
  }

  async function postPurchase(event) {
    event.preventDefault();
    try {
      setError("");
      const lines = purchaseForm.lines.map((line) => {
        const product = products.find((row) => row.id === line.productId);
        const defaultSize =
          product?.productType === "ALCOHOL"
            ? product.bottleVolumeMl
            : product?.inventoryUnit === "PIECE"
              ? "1"
              : "";
        return {
          productId: line.productId,
          packageCount: line.packageCount,
          packageSizeBaseUnits: line.packageSizeBaseUnits || defaultSize,
          lineTotalMinor: minorFromRupees(line.lineTotalRupees),
          batchNumber: line.batchNumber || null,
          manufacturedAt: line.manufacturedAt || null,
          expiresAt: line.expiresAt || null,
          mrpMinor: line.mrpRupees ? minorFromRupees(line.mrpRupees) : null,
          packageLabel: line.packageLabel || null,
        };
      });
      await api.post(
        `${base}/purchases`,
        {
          supplierId: purchaseForm.supplierId || null,
          invoiceNumber: purchaseForm.invoiceNumber || null,
          purchaseDate: purchaseForm.purchaseDate,
          notes: purchaseForm.notes || null,
          lines,
          idempotencyKey: crypto.randomUUID(),
        },
        { headers: authHeaders(token) },
      );
      setPurchaseForm({
        supplierId: "",
        invoiceNumber: "",
        purchaseDate: new Date().toISOString().slice(0, 10),
        notes: "",
        lines: [{ ...EMPTY_PURCHASE_LINE }],
      });
      await loadAll({ quiet: true });
      setTab("Stock");
      notify("Purchase saved and stock added.");
    } catch (err) {
      setError(err.message || apiErrorMessage(err));
    }
  }

  async function postAdjustment(event) {
    event.preventDefault();
    try {
      setError("");
      const key = crypto.randomUUID();
      if (adjustment.mode === "WASTAGE") {
        await api.post(
          `${base}/wastage`,
          {
            productId: adjustment.productId,
            quantityBase: adjustment.quantity,
            reason: adjustment.reason,
            idempotencyKey: key,
          },
          { headers: authHeaders(token) },
        );
      } else {
        await api.post(
          `${base}/adjustments`,
          {
            productId: adjustment.productId,
            quantityDeltaBase: adjustment.quantity,
            costAmountMinor:
              Number(adjustment.quantity) > 0 && adjustment.costRupees
                ? minorFromRupees(adjustment.costRupees)
                : null,
            reason: adjustment.reason,
            idempotencyKey: key,
          },
          { headers: authHeaders(token) },
        );
      }
      setAdjustment({
        mode: "ADJUSTMENT",
        productId: "",
        quantity: "",
        costRupees: "",
        reason: "",
      });
      await loadAll({ quiet: true });
      notify("Stock updated.");
    } catch (err) {
      setError(err.message || apiErrorMessage(err));
    }
  }

  async function postTransfer(event) {
    event.preventDefault();
    try {
      setError("");
      await api.post(
        `${base}/transfer-orders`,
        {
          destinationBranchId: transfer.destinationBranchId,
          lines: [
            {
              productId: transfer.productId,
              quantityBase: transfer.quantityBase,
            },
          ],
          reason: transfer.reason,
          idempotencyKey: crypto.randomUUID(),
        },
        { headers: authHeaders(token) },
      );
      setTransfer({
        destinationBranchId: "",
        productId: "",
        quantityBase: "",
        reason: "",
      });
      await loadAll({ quiet: true });
      notify("Transfer dispatched. Destination stock updates after receipt.");
    } catch (err) {
      setError(err.message || apiErrorMessage(err));
    }
  }

  async function receiveTransfer(transferId) {
    try {
      setError("");
      await api.post(
        `${base}/transfer-orders/${transferId}/receive`,
        {},
        { headers: authHeaders(token) },
      );
      await loadAll({ quiet: true });
      notify("Transfer received and destination stock updated.");
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }
  async function postSupplierReturn(event) {
    event.preventDefault();
    try {
      setError("");
      await api.post(
        `${base}/supplier-returns`,
        {
          ...supplierReturn,
          batchId: supplierReturn.batchId || null,
          creditMinor: minorFromRupees(supplierReturn.creditRupees || "0"),
          idempotencyKey: crypto.randomUUID(),
        },
        { headers: authHeaders(token) },
      );
      setSupplierReturn({
        supplierId: "",
        productId: "",
        batchId: "",
        quantityBase: "",
        creditRupees: "",
        reason: "",
      });
      await loadAll({ quiet: true });
      notify("Supplier return posted and stock reduced.");
    } catch (err) {
      setError(err.message || apiErrorMessage(err));
    }
  }

  useEffect(() => {
    if (!activeStocktake) return setStocktakeCounts({});
    setStocktakeCounts(
      Object.fromEntries(
        (activeStocktake.lines || []).map((line) => [
          line.id,
          { quantity: line.countedQuantityBase ?? "", note: line.note || "" },
        ]),
      ),
    );
  }, [activeStocktake?.id, activeStocktake?.updatedAt]);

  async function createStocktakeSession(event) {
    event.preventDefault();
    try {
      setError("");
      await api.post(`${base}/stocktakes`, stocktakeForm, {
        headers: authHeaders(token),
      });
      setStocktakeForm({
        name: `Physical count ${new Date().toLocaleDateString("en-IN")}`,
        notes: "",
      });
      await loadAll({ quiet: true });
      notify("Stocktake started. Enter the physical quantity for every item.");
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  function updateStocktakeCount(lineId, patch) {
    setStocktakeCounts((current) => ({
      ...current,
      [lineId]: {
        ...(current[lineId] || { quantity: "", note: "" }),
        ...patch,
      },
    }));
  }

  async function saveStocktakeCounts({ quiet = false } = {}) {
    if (!activeStocktake) return null;
    const counts = (activeStocktake.lines || [])
      .filter(
        (line) =>
          String(stocktakeCounts[line.id]?.quantity ?? "").trim() !== "",
      )
      .map((line) => ({
        lineId: line.id,
        countedQuantityBase: stocktakeCounts[line.id].quantity,
        note: stocktakeCounts[line.id].note || null,
      }));
    if (!counts.length) throw new Error("Enter at least one physical count.");
    const { data } = await api.patch(
      `${base}/stocktakes/${activeStocktake.id}/lines`,
      { counts },
      { headers: authHeaders(token) },
    );
    if (!quiet) notify("Counts saved.");
    await loadAll({ quiet: true });
    return data.stocktake;
  }

  async function saveStocktake(event) {
    event.preventDefault();
    try {
      setError("");
      await saveStocktakeCounts();
    } catch (err) {
      setError(err.message || apiErrorMessage(err));
    }
  }
  async function submitStocktakeSession() {
    try {
      setError("");
      await saveStocktakeCounts({ quiet: true });
      await api.post(
        `${base}/stocktakes/${activeStocktake.id}/submit`,
        {},
        { headers: authHeaders(token) },
      );
      await loadAll({ quiet: true });
      notify("Count submitted for manager approval.");
    } catch (err) {
      setError(err.message || apiErrorMessage(err));
    }
  }
  async function postStocktakeSession() {
    try {
      setError("");
      await api.post(
        `${base}/stocktakes/${activeStocktake.id}/post`,
        {},
        { headers: authHeaders(token) },
      );
      await loadAll({ quiet: true });
      notify("Stocktake approved and stock balances updated.");
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  const tabs = [
    { label: "Stock", display: "Current Stock", icon: Boxes },
    { label: "Batches", display: "Batches & Expiry", icon: PackageSearch },
    { label: "Stocktakes", display: "Stocktake", icon: ClipboardCheck },
    { label: "Products", display: "Items", icon: Wine },
    { label: "Purchases", display: "Purchases", icon: PackagePlus },
    { label: "Transfers", display: "Transfers", icon: ArrowLeftRight },
    { label: "Adjustments", display: "Corrections", icon: Scale },
    { label: "Suppliers", display: "Suppliers", icon: Truck },
    { label: "History", display: "History", icon: History },
  ];

  if (!scope.tenantId || !scope.branchId)
    return (
      <div className="inventory-page">
        <ScopeSelector
          token={token}
          access={access}
          scope={scope}
          onChange={setScope}
        />
        <EmptyPanel
          icon={Store}
          title="Choose a branch"
          body="Choose the branch whose stock you want to manage."
        />
      </div>
    );

  return (
    <div className="inventory-page">
      <div className="inventory-hero">
        <div>
          <div className="inventory-mini">Stock</div>
          <h2>Stock</h2>
          <p>
            Check what is available, add purchases, create items and record
            wastage or corrections.
          </p>
        </div>
        <button
          className="scorm-button-secondary"
          onClick={() => loadAll()}
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? "spin" : ""} />
          Refresh
        </button>
      </div>
      <ScopeSelector
        token={token}
        access={access}
        scope={scope}
        onChange={setScope}
      />
      {activeBranchName && (
        <div className="inventory-branch-note">
          <Store size={14} />
          Working in {activeBranchName}
        </div>
      )}
      {error && <div className="inventory-error">{error}</div>}
      {notice && <div className="inventory-notice">{notice}</div>}

      <div className="inventory-metrics">
        <InventoryMetric
          label="Items"
          value={summary.productCount || 0}
          icon={Wine}
        />
        <InventoryMetric
          label="Items in stock"
          value={summary.stockedProducts || 0}
          icon={Boxes}
        />
        <InventoryMetric
          label="Purchases"
          value={summary.purchaseCount || 0}
          icon={PackagePlus}
        />
        <InventoryMetric
          label="Stock changes"
          value={summary.movementCount || 0}
          icon={History}
        />
        <InventoryMetric
          label="Stock value"
          value={rupeesFromMinor(summary.inventoryValueMinor)}
          icon={Scale}
        />
      </div>
      <div className="workspace-tabs">
        {tabs.map(({ label, display, icon: Icon }) => (
          <button
            key={label}
            className={tab === label ? "is-active" : ""}
            onClick={() => setTab(label)}
          >
            <Icon size={15} />
            <span>{display}</span>
          </button>
        ))}
      </div>

      {tab === "Stock" && (
        <section className="inventory-panel">
          <div className="inventory-panel-head">
            <div>
              <div className="inventory-mini">Current stock</div>
              <h3>What is available now?</h3>
            </div>
            <span>{stockRows.length} items</span>
          </div>
          {!stockRows.length ? (
            <EmptyPanel
              title="No stock yet"
              body="Add an item and save a purchase to create stock."
            />
          ) : (
            <div className="inventory-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Selling prices</th>
                    <th>Stock</th>
                    <th>Average cost</th>
                    <th>Stock value</th>
                  </tr>
                </thead>
                <tbody>
                  {stockRows.map((product) => {
                    const balance = extractBalance(product);
                    return (
                      <tr key={product.id}>
                        <td>
                          <div className="product-cell">
                            {product.imageUrl ? (
                              <img src={product.imageUrl} alt="" />
                            ) : (
                              <div className="product-placeholder">
                                <Wine size={16} />
                              </div>
                            )}
                            <div>
                              <strong>{product.name}</strong>
                              <span>
                                {product.brand || "No brand"} ·{" "}
                                {product.sku || "No SKU"}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="price-chips">
                            {(product.priceOptions || [])
                              .slice(0, 4)
                              .map((price) => (
                                <span key={price.id}>
                                  {price.label}{" "}
                                  {rupeesFromMinor(price.priceMinor)}
                                </span>
                              ))}
                          </div>
                        </td>
                        <td>
                          <strong>
                            {cleanQuantity(balance?.quantityBase || 0)}{" "}
                            {product.inventoryUnit}
                          </strong>
                        </td>
                        <td>
                          {rupeesFromMinor(
                            balance
                              ? String(
                                  Math.round(
                                    Number(
                                      balance.weightedAverageCostMinorPerUnit ||
                                        0,
                                    ),
                                  ),
                                )
                              : "0",
                          )}
                        </td>
                        <td>
                          <strong>
                            {rupeesFromMinor(
                              balance?.inventoryValueMinor || "0",
                            )}
                          </strong>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === "Batches" && (
        <section className="inventory-panel">
          <div className="inventory-panel-head">
            <div>
              <div className="inventory-mini">FEFO control</div>
              <h3>Batches, expiry & MRP</h3>
            </div>
            <span>{batches.length} batches</span>
          </div>
          {!batches.length ? (
            <EmptyPanel
              title="No batches yet"
              body="Every new purchase creates a traceable batch, even when the supplier did not provide a lot number."
            />
          ) : (
            <div className="inventory-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Batch</th>
                    <th>Pack conversion</th>
                    <th>Available</th>
                    <th>Expiry</th>
                    <th>MRP</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((batch) => {
                    const product = products.find(
                      (row) => row.id === batch.productId,
                    );
                    const days = batch.expiresAt
                      ? Math.ceil(
                          (new Date(batch.expiresAt) - new Date()) / 86400000,
                        )
                      : null;
                    return (
                      <tr key={batch.id}>
                        <td>
                          <strong>{product?.name || "Item"}</strong>
                        </td>
                        <td>{batch.batchNumber}</td>
                        <td>
                          {batch.packageLabel ||
                            `${cleanQuantity(batch.packageSizeBaseUnits)} ${product?.inventoryUnit || ""} / pack`}
                        </td>
                        <td>
                          {cleanQuantity(batch.quantityCurrentBase)}{" "}
                          {product?.inventoryUnit}
                        </td>
                        <td>
                          <span
                            className={
                              days !== null && days <= 30 ? "expiry-alert" : ""
                            }
                          >
                            {batch.expiresAt || "No expiry"}
                            {days !== null ? ` · ${days} days` : ""}
                          </span>
                        </td>
                        <td>
                          {batch.mrpMinor
                            ? rupeesFromMinor(batch.mrpMinor)
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === "Stocktakes" && (
        <div className="stocktake-layout">
          {!activeStocktake ? (
            <form
              className="inventory-panel inventory-form stocktake-start"
              onSubmit={createStocktakeSession}
            >
              <div className="inventory-panel-head">
                <div>
                  <div className="inventory-mini">Physical verification</div>
                  <h3>Start a stocktake</h3>
                </div>
                <ClipboardCheck size={18} />
              </div>
              <label>
                <span>Count name</span>
                <input
                  value={stocktakeForm.name}
                  onChange={(e) =>
                    setStocktakeForm({ ...stocktakeForm, name: e.target.value })
                  }
                  required
                />
              </label>
              <label>
                <span>Instructions or area (optional)</span>
                <textarea
                  rows="3"
                  value={stocktakeForm.notes}
                  onChange={(e) =>
                    setStocktakeForm({
                      ...stocktakeForm,
                      notes: e.target.value,
                    })
                  }
                  placeholder="Main bar, cellar, shop floor..."
                />
              </label>
              <div className="stocktake-warning">
                Starting captures the expected quantity and ledger version for
                every tracked item. Only one open count is allowed per branch.
              </div>
              <button className="scorm-button-primary inventory-submit">
                <ClipboardCheck size={14} />
                Start physical count
              </button>
            </form>
          ) : (
            <form
              className="inventory-panel stocktake-session"
              onSubmit={saveStocktake}
            >
              <div className="inventory-panel-head">
                <div>
                  <div className="inventory-mini">
                    {activeStocktake.status === "COUNTING"
                      ? "Count in progress"
                      : "Awaiting approval"}
                  </div>
                  <h3>{activeStocktake.name}</h3>
                </div>
                <span>
                  {
                    (activeStocktake.lines || []).filter(
                      (line) => stocktakeCounts[line.id]?.quantity !== "",
                    ).length
                  }
                  /{activeStocktake.lines?.length || 0} counted
                </span>
              </div>
              <div className="stocktake-summary">
                <span>
                  Started{" "}
                  {new Date(activeStocktake.createdAt).toLocaleString("en-IN")}
                </span>
                <strong>{activeStocktake.status}</strong>
              </div>
              <div className="inventory-table-wrap">
                <table className="stocktake-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Expected</th>
                      <th>Physical count</th>
                      <th>Variance</th>
                      <th>Count note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(activeStocktake.lines || []).map((line) => {
                      const draft = stocktakeCounts[line.id] || {
                        quantity: "",
                        note: "",
                      };
                      const variance =
                        draft.quantity === ""
                          ? null
                          : Number(draft.quantity) -
                            Number(line.expectedQuantityBase);
                      return (
                        <tr key={line.id}>
                          <td>
                            <strong>{line.product?.name || "Item"}</strong>
                            <span className="stocktake-unit">
                              {line.product?.sku || "No SKU"} ·{" "}
                              {line.product?.inventoryUnit}
                            </span>
                          </td>
                          <td>{cleanQuantity(line.expectedQuantityBase)}</td>
                          <td>
                            <input
                              aria-label={`Physical count for ${line.product?.name || "item"}`}
                              type="number"
                              min="0"
                              step="0.001"
                              value={draft.quantity}
                              disabled={activeStocktake.status !== "COUNTING"}
                              onChange={(e) =>
                                updateStocktakeCount(line.id, {
                                  quantity: e.target.value,
                                })
                              }
                              placeholder="0"
                            />
                          </td>
                          <td>
                            <span
                              className={
                                variance === null
                                  ? "variance-neutral"
                                  : variance === 0
                                    ? "variance-neutral"
                                    : variance > 0
                                      ? "variance-positive"
                                      : "variance-negative"
                              }
                            >
                              {variance === null
                                ? "—"
                                : `${variance > 0 ? "+" : ""}${cleanQuantity(variance)}`}
                            </span>
                          </td>
                          <td>
                            <input
                              aria-label={`Count note for ${line.product?.name || "item"}`}
                              value={draft.note}
                              disabled={activeStocktake.status !== "COUNTING"}
                              onChange={(e) =>
                                updateStocktakeCount(line.id, {
                                  note: e.target.value,
                                })
                              }
                              placeholder="Breakage, sealed case..."
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="stocktake-actions">
                {activeStocktake.status === "COUNTING" ? (
                  <>
                    <button type="submit" className="scorm-button-secondary">
                      Save draft
                    </button>
                    <button
                      type="button"
                      className="scorm-button-primary"
                      onClick={submitStocktakeSession}
                    >
                      Submit count
                    </button>
                  </>
                ) : (
                  <>
                    <span>
                      Posting is restricted to a Branch Manager or Tenant Admin.
                    </span>
                    <button
                      type="button"
                      className="scorm-button-primary"
                      onClick={postStocktakeSession}
                    >
                      Approve & update stock
                    </button>
                  </>
                )}
              </div>
            </form>
          )}
          <section className="inventory-panel">
            <div className="inventory-panel-head">
              <div>
                <div className="inventory-mini">Count history</div>
                <h3>Stocktakes</h3>
              </div>
              <span>{stocktakes.length}</span>
            </div>
            {!stocktakes.length ? (
              <EmptyPanel
                icon={ClipboardCheck}
                title="No counts yet"
                body="Start a physical count to compare the shelf with the stock ledger."
              />
            ) : (
              <div className="history-list">
                {stocktakes.map((row) => (
                  <div className="history-row" key={row.id}>
                    <div>
                      <strong>{row.name}</strong>
                      <span>
                        {new Date(row.createdAt).toLocaleString("en-IN")} ·{" "}
                        {row.lines?.length || 0} items
                      </span>
                    </div>
                    <div>
                      <strong>{row.status}</strong>
                      <span>
                        {
                          (row.lines || []).filter(
                            (line) => Number(line.varianceQuantityBase) !== 0,
                          ).length
                        }{" "}
                        variances
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {tab === "Products" && (
        <div className="inventory-two-column">
          <form
            className="inventory-panel inventory-form"
            onSubmit={createProduct}
          >
            <div className="inventory-panel-head">
              <div>
                <div className="inventory-mini">New item</div>
                <h3>Add item</h3>
              </div>
              <PackagePlus size={18} />
            </div>
            <div className="form-grid two">
              <label>
                <span>Item name</span>
                <input
                  value={productForm.name}
                  onChange={(e) =>
                    setProductForm({ ...productForm, name: e.target.value })
                  }
                  required
                  placeholder="Johnnie Walker Black Label"
                />
              </label>
              <label>
                <span>Brand</span>
                <input
                  value={productForm.brand}
                  onChange={(e) =>
                    setProductForm({ ...productForm, brand: e.target.value })
                  }
                  placeholder="Johnnie Walker"
                />
              </label>
            </div>
            <div className="form-grid two">
              <label>
                <span>SKU (optional)</span>
                <input
                  value={productForm.sku}
                  onChange={(e) =>
                    setProductForm({ ...productForm, sku: e.target.value })
                  }
                />
              </label>
              <label>
                <span>Barcode (optional)</span>
                <input
                  value={productForm.barcode}
                  onChange={(e) =>
                    setProductForm({ ...productForm, barcode: e.target.value })
                  }
                />
              </label>
            </div>
            <div className="form-grid two">
              <label>
                <span>Item type</span>
                <select
                  value={productForm.productType}
                  onChange={(e) =>
                    setProductForm({
                      ...productForm,
                      productType: e.target.value,
                      inventoryUnit:
                        e.target.value === "ALCOHOL" ? "ML" : "PIECE",
                    })
                  }
                >
                  <option>ALCOHOL</option>
                  <option>FOOD</option>
                  <option>MIXER</option>
                  <option>OTHER</option>
                </select>
              </label>
              <label>
                <span>Category</span>
                <select
                  value={productForm.categoryId}
                  onChange={(e) =>
                    setProductForm({
                      ...productForm,
                      categoryId: e.target.value,
                    })
                  }
                >
                  <option value="">No category</option>
                  {categories.map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {productForm.productType === "ALCOHOL" ? (
              <label>
                <span>Bottle size (ML)</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={productForm.bottleVolumeMl}
                  onChange={(e) =>
                    setProductForm({
                      ...productForm,
                      bottleVolumeMl: e.target.value,
                    })
                  }
                  required
                />
              </label>
            ) : (
              <label>
                <span>Stock unit</span>
                <select
                  value={productForm.inventoryUnit}
                  onChange={(e) =>
                    setProductForm({
                      ...productForm,
                      inventoryUnit: e.target.value,
                    })
                  }
                >
                  <option>PIECE</option>
                  <option>GRAM</option>
                  <option>ML</option>
                </select>
              </label>
            )}
            <div className="inventory-subhead">
              Selling prices for this branch
            </div>
            {productForm.productType === "ALCOHOL" ? (
              <>
                <div className="form-grid four">
                  <label>
                    <span>30 ml ₹</span>
                    <input
                      value={productForm.p30}
                      onChange={(e) =>
                        setProductForm({ ...productForm, p30: e.target.value })
                      }
                      inputMode="decimal"
                    />
                  </label>
                  <label>
                    <span>60 ml ₹</span>
                    <input
                      value={productForm.p60}
                      onChange={(e) =>
                        setProductForm({ ...productForm, p60: e.target.value })
                      }
                      inputMode="decimal"
                    />
                  </label>
                  <label>
                    <span>90 ml ₹</span>
                    <input
                      value={productForm.p90}
                      onChange={(e) =>
                        setProductForm({ ...productForm, p90: e.target.value })
                      }
                      inputMode="decimal"
                    />
                  </label>
                  <label>
                    <span>Full bottle ₹</span>
                    <input
                      value={productForm.pFull}
                      onChange={(e) =>
                        setProductForm({
                          ...productForm,
                          pFull: e.target.value,
                        })
                      }
                      inputMode="decimal"
                    />
                  </label>
                </div>
                <div className="form-grid two">
                  <label>
                    <span>Other ML size</span>
                    <input
                      value={productForm.customQty}
                      onChange={(e) =>
                        setProductForm({
                          ...productForm,
                          customQty: e.target.value,
                        })
                      }
                      inputMode="decimal"
                      placeholder="100"
                    />
                  </label>
                  <label>
                    <span>Other size price ₹</span>
                    <input
                      value={productForm.customPrice}
                      onChange={(e) =>
                        setProductForm({
                          ...productForm,
                          customPrice: e.target.value,
                        })
                      }
                      inputMode="decimal"
                    />
                  </label>
                </div>
              </>
            ) : (
              <label>
                <span>Selling price ₹</span>
                <input
                  value={productForm.pFull}
                  onChange={(e) =>
                    setProductForm({ ...productForm, pFull: e.target.value })
                  }
                  inputMode="decimal"
                />
              </label>
            )}
            <button className="scorm-button-primary inventory-submit">
              <Plus size={14} />
              Add item
            </button>
          </form>
          <div className="inventory-panel">
            <div className="inventory-panel-head">
              <div>
                <div className="inventory-mini">Items</div>
                <h3>{products.length} items</h3>
              </div>
            </div>
            <form className="inline-create" onSubmit={createCategory}>
              <input
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                placeholder="New category"
              />
              <button className="scorm-button-secondary">
                <Plus size={13} />
                Add category
              </button>
            </form>
            <div className="product-list">
              {!products.length && (
                <EmptyPanel title="No items yet" body="Add your first item." />
              )}
              {products.map((product) => (
                <div className="product-list-row" key={product.id}>
                  <div className="product-cell">
                    {product.imageUrl ? (
                      <img src={product.imageUrl} alt="" />
                    ) : (
                      <div className="product-placeholder">
                        <Wine size={16} />
                      </div>
                    )}
                    <div>
                      <strong>{product.name}</strong>
                      <span>
                        {product.productType} · {product.inventoryUnit}
                        {product.bottleVolumeMl
                          ? ` · ${cleanQuantity(product.bottleVolumeMl)} ML bottle`
                          : ""}
                      </span>
                      <div className="price-chips">
                        {(product.priceOptions || []).map((price) => (
                          <span key={price.id}>
                            {price.label} {rupeesFromMinor(price.priceMinor)}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <label className="image-upload">
                    <ImagePlus size={14} />
                    <span>Add image</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) =>
                        uploadImage(product.id, e.target.files?.[0])
                      }
                    />
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "Purchases" && (
        <div className="inventory-two-column purchase-layout">
          <form
            className="inventory-panel inventory-form"
            onSubmit={postPurchase}
          >
            <div className="inventory-panel-head">
              <div>
                <div className="inventory-mini">Purchase</div>
                <h3>Add purchase & receive stock</h3>
              </div>
              <ClipboardPlus size={18} />
            </div>
            <div className="form-grid two">
              <label>
                <span>Supplier</span>
                <select
                  value={purchaseForm.supplierId}
                  onChange={(e) =>
                    setPurchaseForm({
                      ...purchaseForm,
                      supplierId: e.target.value,
                    })
                  }
                >
                  <option value="">No supplier</option>
                  {suppliers.map((s) => (
                    <option value={s.id} key={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Invoice number</span>
                <input
                  value={purchaseForm.invoiceNumber}
                  onChange={(e) =>
                    setPurchaseForm({
                      ...purchaseForm,
                      invoiceNumber: e.target.value,
                    })
                  }
                  placeholder="INV-001"
                />
              </label>
            </div>
            <label>
              <span>Purchase date</span>
              <input
                type="date"
                value={purchaseForm.purchaseDate}
                onChange={(e) =>
                  setPurchaseForm({
                    ...purchaseForm,
                    purchaseDate: e.target.value,
                  })
                }
                required
              />
            </label>
            <div className="purchase-lines">
              {purchaseForm.lines.map((line, index) => {
                const product = products.find(
                  (row) => row.id === line.productId,
                );
                return (
                  <div className="purchase-line" key={index}>
                    <div className="purchase-line-number">{index + 1}</div>
                    <div className="purchase-line-fields">
                      <label>
                        <span>Item</span>
                        <select
                          value={line.productId}
                          onChange={(e) =>
                            updatePurchaseLine(index, {
                              productId: e.target.value,
                              packageSizeBaseUnits: "",
                            })
                          }
                          required
                        >
                          <option value="">Choose item</option>
                          {products
                            .filter((row) => row.trackInventory)
                            .map((row) => (
                              <option value={row.id} key={row.id}>
                                {row.name}
                              </option>
                            ))}
                        </select>
                      </label>
                      <div className="form-grid three">
                        <label>
                          <span>
                            {product?.productType === "ALCOHOL"
                              ? "Bottles"
                              : "Packages"}
                          </span>
                          <input
                            type="number"
                            min="0.001"
                            step="0.001"
                            value={line.packageCount}
                            onChange={(e) =>
                              updatePurchaseLine(index, {
                                packageCount: e.target.value,
                              })
                            }
                            required
                          />
                        </label>
                        <label>
                          <span>Size per package</span>
                          <input
                            type="number"
                            min="0.001"
                            step="0.001"
                            value={line.packageSizeBaseUnits}
                            onChange={(e) =>
                              updatePurchaseLine(index, {
                                packageSizeBaseUnits: e.target.value,
                              })
                            }
                            placeholder={
                              product?.bottleVolumeMl ||
                              (product?.inventoryUnit === "PIECE"
                                ? "1"
                                : "Required")
                            }
                          />
                        </label>
                        <label>
                          <span>Total cost ₹</span>
                          <input
                            value={line.lineTotalRupees}
                            onChange={(e) =>
                              updatePurchaseLine(index, {
                                lineTotalRupees: e.target.value,
                              })
                            }
                            inputMode="decimal"
                            required
                          />
                        </label>
                      </div>
                      <div className="form-grid four batch-fields">
                        <label>
                          <span>Batch / lot</span>
                          <input
                            value={line.batchNumber}
                            onChange={(e) =>
                              updatePurchaseLine(index, {
                                batchNumber: e.target.value,
                              })
                            }
                            placeholder="LOT-2026-01"
                          />
                        </label>
                        <label>
                          <span>Pack label</span>
                          <input
                            value={line.packageLabel}
                            onChange={(e) =>
                              updatePurchaseLine(index, {
                                packageLabel: e.target.value,
                              })
                            }
                            placeholder="Case of 12"
                          />
                        </label>
                        <label>
                          <span>Expiry</span>
                          <input
                            type="date"
                            value={line.expiresAt}
                            onChange={(e) =>
                              updatePurchaseLine(index, {
                                expiresAt: e.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          <span>MRP ₹</span>
                          <input
                            value={line.mrpRupees}
                            onChange={(e) =>
                              updatePurchaseLine(index, {
                                mrpRupees: e.target.value,
                              })
                            }
                            inputMode="decimal"
                            placeholder="0.00"
                          />
                        </label>
                      </div>
                    </div>
                    {purchaseForm.lines.length > 1 && (
                      <button
                        type="button"
                        className="remove-line"
                        onClick={() => removePurchaseLine(index)}
                      >
                        ×
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              className="scorm-button-secondary add-line"
              onClick={addPurchaseLine}
            >
              <Plus size={13} />
              Add another item
            </button>
            <label>
              <span>Note (optional)</span>
              <textarea
                rows="3"
                value={purchaseForm.notes}
                onChange={(e) =>
                  setPurchaseForm({ ...purchaseForm, notes: e.target.value })
                }
              />
            </label>
            <button className="scorm-button-primary inventory-submit">
              <Upload size={14} />
              Save purchase & add stock
            </button>
          </form>
          <div className="inventory-panel">
            <div className="inventory-panel-head">
              <div>
                <div className="inventory-mini">Recent purchases</div>
                <h3>Purchases</h3>
              </div>
              <span>{purchases.length}</span>
            </div>
            <div className="history-list">
              {!purchases.length && (
                <EmptyPanel
                  title="No purchases yet"
                  body="Saved purchases will appear here."
                />
              )}
              {purchases.map((purchase) => (
                <div className="history-row" key={purchase.id}>
                  <div>
                    <strong>{purchase.invoiceNumber || "Purchase"}</strong>
                    <span>
                      {purchase.supplier?.name || "No supplier"} ·{" "}
                      {purchase.purchaseDate}
                    </span>
                  </div>
                  <div>
                    <strong>{rupeesFromMinor(purchase.totalMinor)}</strong>
                    <span>{purchase.lines?.length || 0} items</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "Adjustments" && (
        <div className="inventory-two-column compact-layout">
          <form
            className="inventory-panel inventory-form"
            onSubmit={postAdjustment}
          >
            <div className="inventory-panel-head">
              <div>
                <div className="inventory-mini">Stock correction</div>
                <h3>Correct stock or record wastage</h3>
              </div>
              <Scale size={18} />
            </div>
            <div className="adjustment-mode">
              <button
                type="button"
                className={adjustment.mode === "ADJUSTMENT" ? "is-active" : ""}
                onClick={() =>
                  setAdjustment({ ...adjustment, mode: "ADJUSTMENT" })
                }
              >
                Stock correction
              </button>
              <button
                type="button"
                className={adjustment.mode === "WASTAGE" ? "is-active" : ""}
                onClick={() =>
                  setAdjustment({
                    ...adjustment,
                    mode: "WASTAGE",
                    costRupees: "",
                  })
                }
              >
                Wastage / spillage
              </button>
            </div>
            <label>
              <span>Item</span>
              <select
                value={adjustment.productId}
                onChange={(e) =>
                  setAdjustment({ ...adjustment, productId: e.target.value })
                }
                required
              >
                <option value="">Choose item</option>
                {products
                  .filter((row) => row.trackInventory)
                  .map((row) => (
                    <option value={row.id} key={row.id}>
                      {row.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              <span>
                {adjustment.mode === "WASTAGE"
                  ? "Quantity wasted"
                  : "Quantity (+ to add, - to remove)"}
              </span>
              <input
                type="number"
                step="0.001"
                min={adjustment.mode === "WASTAGE" ? "0.001" : undefined}
                value={adjustment.quantity}
                onChange={(e) =>
                  setAdjustment({ ...adjustment, quantity: e.target.value })
                }
                required
                placeholder={
                  adjustment.mode === "WASTAGE" ? "60" : "-30 or 750"
                }
              />
            </label>
            {adjustment.mode === "ADJUSTMENT" &&
              Number(adjustment.quantity) > 0 && (
                <label>
                  <span>Cost of added stock ₹ (optional)</span>
                  <input
                    value={adjustment.costRupees}
                    onChange={(e) =>
                      setAdjustment({
                        ...adjustment,
                        costRupees: e.target.value,
                      })
                    }
                    inputMode="decimal"
                  />
                </label>
              )}
            <label>
              <span>Why are you changing it?</span>
              <textarea
                rows="4"
                value={adjustment.reason}
                onChange={(e) =>
                  setAdjustment({ ...adjustment, reason: e.target.value })
                }
                required
                placeholder="Stock count correction, bottle breakage, spillage..."
              />
            </label>
            <button className="scorm-button-primary inventory-submit">
              <ArrowRight size={14} />
              Update stock
            </button>
          </form>
          <div className="inventory-panel inventory-guidance">
            <div className="inventory-mini">Good to know</div>
            <h3>Every stock change is saved</h3>
            <p>You can always see who changed stock and why in History.</p>
            <div className="guidance-callout">
              <Scale size={16} />
              <span>
                Alcohol is counted in ML. A 30 ML sale removes 30 ML; a 750 ML
                bottle sale removes 750 ML automatically.
              </span>
            </div>
          </div>
        </div>
      )}

      {tab === "Transfers" && (
        <div className="inventory-two-column compact-layout">
          <form
            className="inventory-panel inventory-form"
            onSubmit={postTransfer}
          >
            <div className="inventory-panel-head">
              <div>
                <div className="inventory-mini">Inter-branch transfer</div>
                <h3>Move stock to another branch</h3>
              </div>
              <ArrowLeftRight size={18} />
            </div>
            <label>
              <span>Destination branch</span>
              <select
                value={transfer.destinationBranchId}
                onChange={(e) =>
                  setTransfer({
                    ...transfer,
                    destinationBranchId: e.target.value,
                  })
                }
                required
              >
                <option value="">Choose branch</option>
                {transferBranches.map((branch) => (
                  <option value={branch.id} key={branch.id}>
                    {branch.name} · {branch.code}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Item</span>
              <select
                value={transfer.productId}
                onChange={(e) =>
                  setTransfer({ ...transfer, productId: e.target.value })
                }
                required
              >
                <option value="">Choose item</option>
                {products
                  .filter(
                    (row) =>
                      row.trackInventory &&
                      Number(extractBalance(row)?.quantityBase || 0) > 0,
                  )
                  .map((row) => (
                    <option value={row.id} key={row.id}>
                      {row.name} ·{" "}
                      {cleanQuantity(extractBalance(row)?.quantityBase || 0)}{" "}
                      {row.inventoryUnit} available
                    </option>
                  ))}
              </select>
            </label>
            <label>
              <span>Quantity to move</span>
              <input
                type="number"
                step="0.001"
                min="0.001"
                value={transfer.quantityBase}
                onChange={(e) =>
                  setTransfer({ ...transfer, quantityBase: e.target.value })
                }
                required
                placeholder="750"
              />
            </label>
            <label>
              <span>Transfer reason</span>
              <textarea
                rows="4"
                value={transfer.reason}
                onChange={(e) =>
                  setTransfer({ ...transfer, reason: e.target.value })
                }
                required
                placeholder="Restock branch, event stock, central store dispatch..."
              />
            </label>
            <button
              className="scorm-button-primary inventory-submit"
              disabled={!transferBranches.length}
            >
              <ArrowRight size={14} />
              Transfer stock
            </button>
            {!transferBranches.length && (
              <div className="inventory-inline-error">
                You need stock access to another active branch before you can
                transfer items.
              </div>
            )}
          </form>
          <div className="inventory-panel">
            <div className="inventory-panel-head">
              <div>
                <div className="inventory-mini">Transfer control</div>
                <h3>In transit & received</h3>
              </div>
              <span>{transferOrders.length}</span>
            </div>
            <div className="history-list">
              {!transferOrders.length && (
                <EmptyPanel
                  title="No transfers"
                  body="Dispatched stock stays in transit until the destination confirms receipt."
                />
              )}
              {transferOrders.map((row) => (
                <div className="history-row transfer-row" key={row.id}>
                  <div>
                    <strong>{row.transferNumber}</strong>
                    <span>
                      {row.sourceBranchId === scope.branchId
                        ? "Outgoing"
                        : "Incoming"}{" "}
                      ·{" "}
                      {(row.lines || [])
                        .map(
                          (line) =>
                            `${products.find((product) => product.id === line.productId)?.name || "Item"} ${cleanQuantity(line.quantityBase)}`,
                        )
                        .join(", ")}
                    </span>
                  </div>
                  <div>
                    <strong>{row.status.replaceAll("_", " ")}</strong>
                    {row.status === "IN_TRANSIT" &&
                    row.destinationBranchId === scope.branchId ? (
                      <button
                        className="scorm-button-primary"
                        onClick={() => receiveTransfer(row.id)}
                      >
                        Receive stock
                      </button>
                    ) : (
                      <span>
                        {new Date(row.dispatchedAt).toLocaleString("en-IN")}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "Suppliers" && (
        <div className="inventory-two-column compact-layout">
          <form
            className="inventory-panel inventory-form"
            onSubmit={createSupplier}
          >
            <div className="inventory-panel-head">
              <div>
                <div className="inventory-mini">Supplier</div>
                <h3>Add supplier</h3>
              </div>
              <Truck size={18} />
            </div>
            <label>
              <span>Name</span>
              <input
                value={supplierForm.name}
                onChange={(e) =>
                  setSupplierForm({ ...supplierForm, name: e.target.value })
                }
                required
              />
            </label>
            <div className="form-grid two">
              <label>
                <span>Phone</span>
                <input
                  value={supplierForm.phone}
                  onChange={(e) =>
                    setSupplierForm({ ...supplierForm, phone: e.target.value })
                  }
                />
              </label>
              <label>
                <span>Email</span>
                <input
                  type="email"
                  value={supplierForm.email}
                  onChange={(e) =>
                    setSupplierForm({ ...supplierForm, email: e.target.value })
                  }
                />
              </label>
            </div>
            <label>
              <span>GSTIN (optional)</span>
              <input
                value={supplierForm.gstin}
                onChange={(e) =>
                  setSupplierForm({ ...supplierForm, gstin: e.target.value })
                }
              />
            </label>
            <button className="scorm-button-primary inventory-submit">
              <Plus size={14} />
              Add supplier
            </button>
          </form>
          <div className="inventory-panel">
            <div className="inventory-panel-head">
              <div>
                <div className="inventory-mini">Suppliers</div>
                <h3>Supplier list</h3>
              </div>
              <span>{suppliers.length}</span>
            </div>
            <div className="history-list">
              {!suppliers.length && (
                <EmptyPanel
                  icon={Truck}
                  title="No suppliers yet"
                  body="Add a supplier if you want purchases linked to a vendor."
                />
              )}
              {suppliers.map((supplier) => (
                <div className="history-row" key={supplier.id}>
                  <div>
                    <strong>{supplier.name}</strong>
                    <span>{supplier.gstin || "No GSTIN"}</span>
                  </div>
                  <div>
                    <strong>{supplier.phone || "—"}</strong>
                    <span>{supplier.email || "No email"}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <form
            className="inventory-panel inventory-form"
            onSubmit={postSupplierReturn}
          >
            <div className="inventory-panel-head">
              <div>
                <div className="inventory-mini">Return to vendor</div>
                <h3>Supplier return</h3>
              </div>
              <Truck size={18} />
            </div>
            <label>
              <span>Supplier</span>
              <select
                value={supplierReturn.supplierId}
                onChange={(e) =>
                  setSupplierReturn({
                    ...supplierReturn,
                    supplierId: e.target.value,
                    batchId: "",
                  })
                }
                required
              >
                <option value="">Choose supplier</option>
                {suppliers.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Item</span>
              <select
                value={supplierReturn.productId}
                onChange={(e) =>
                  setSupplierReturn({
                    ...supplierReturn,
                    productId: e.target.value,
                    batchId: "",
                  })
                }
                required
              >
                <option value="">Choose item</option>
                {products
                  .filter((row) => row.trackInventory)
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              <span>Batch (optional)</span>
              <select
                value={supplierReturn.batchId}
                onChange={(e) =>
                  setSupplierReturn({
                    ...supplierReturn,
                    batchId: e.target.value,
                  })
                }
              >
                <option value="">Any stock</option>
                {batches
                  .filter(
                    (row) =>
                      row.productId === supplierReturn.productId &&
                      (!supplierReturn.supplierId ||
                        row.supplierId === supplierReturn.supplierId) &&
                      Number(row.quantityCurrentBase) > 0,
                  )
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.batchNumber} ·{" "}
                      {cleanQuantity(row.quantityCurrentBase)} available
                    </option>
                  ))}
              </select>
            </label>
            <div className="form-grid two">
              <label>
                <span>Quantity</span>
                <input
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={supplierReturn.quantityBase}
                  onChange={(e) =>
                    setSupplierReturn({
                      ...supplierReturn,
                      quantityBase: e.target.value,
                    })
                  }
                  required
                />
              </label>
              <label>
                <span>Supplier credit ₹</span>
                <input
                  value={supplierReturn.creditRupees}
                  onChange={(e) =>
                    setSupplierReturn({
                      ...supplierReturn,
                      creditRupees: e.target.value,
                    })
                  }
                  inputMode="decimal"
                  required
                />
              </label>
            </div>
            <label>
              <span>Reason</span>
              <textarea
                rows="3"
                value={supplierReturn.reason}
                onChange={(e) =>
                  setSupplierReturn({
                    ...supplierReturn,
                    reason: e.target.value,
                  })
                }
                required
                placeholder="Expired, damaged, short-dated, quality issue…"
              />
            </label>
            <button className="scorm-button-primary inventory-submit">
              Post supplier return
            </button>
          </form>
          <div className="inventory-panel">
            <div className="inventory-panel-head">
              <div>
                <div className="inventory-mini">Debit history</div>
                <h3>Supplier returns</h3>
              </div>
              <span>{supplierReturns.length}</span>
            </div>
            <div className="history-list">
              {supplierReturns.map((row) => (
                <div className="history-row" key={row.id}>
                  <div>
                    <strong>{row.returnNumber}</strong>
                    <span>
                      {products.find((product) => product.id === row.productId)
                        ?.name || "Item"}{" "}
                      · {cleanQuantity(row.quantityBase)}
                    </span>
                  </div>
                  <div>
                    <strong>{rupeesFromMinor(row.creditMinor)}</strong>
                    <span>{row.reason}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "History" && (
        <section className="inventory-panel">
          <div className="inventory-panel-head">
            <div>
              <div className="inventory-mini">Stock history</div>
              <h3>All recent stock changes</h3>
            </div>
            <span>{movements.length} latest</span>
          </div>
          {!movements.length ? (
            <EmptyPanel
              icon={History}
              title="No stock history yet"
              body="Purchases, sales, wastage and corrections will appear here."
            />
          ) : (
            <div className="inventory-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Item</th>
                    <th>Change type</th>
                    <th>Quantity</th>
                    <th>Cost</th>
                    <th>Balance after</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((movement) => (
                    <tr key={movement.id}>
                      <td>
                        {new Date(movement.createdAt).toLocaleString("en-IN")}
                      </td>
                      <td>
                        <strong>{movement.product?.name || "Item"}</strong>
                      </td>
                      <td>
                        <span
                          className={`movement-pill ${Number(movement.quantityDeltaBase) >= 0 ? "in" : "out"}`}
                        >
                          {String(movement.movementType || "").replaceAll(
                            "_",
                            " ",
                          )}
                        </span>
                      </td>
                      <td>
                        <strong>
                          {Number(movement.quantityDeltaBase) > 0 ? "+" : ""}
                          {cleanQuantity(movement.quantityDeltaBase)}{" "}
                          {movement.product?.inventoryUnit}
                        </strong>
                      </td>
                      <td>{rupeesFromMinor(movement.costAmountMinor)}</td>
                      <td>{cleanQuantity(movement.stockAfterBase)}</td>
                      <td>{movement.reason || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
