import React, { useEffect, useMemo, useState } from "react";
import {
  Banknote,
  CheckCircle2,
  CloudOff,
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
  Wine,
} from "lucide-react";
import { api, apiErrorMessage, authHeaders } from "./api";
import {
  enqueueOfflineSale,
  offlineSaleCount,
  syncOfflineSales,
} from "./offlineQueue";
import "./cashier.css";

function formatMoney(value) {
  try {
    const amount = BigInt(value || 0);
    return `₹${(amount / 100n).toLocaleString("en-IN")}.${String(amount % 100n).padStart(2, "0")}`;
  } catch (_) {
    return "₹0.00";
  }
}

function minorFromRupees(value) {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d+)(?:\.(\d{0,2}))?$/);
  if (!match)
    throw new Error("Enter a valid cash amount with up to 2 decimal places.");
  return (
    BigInt(match[1]) * 100n +
    BigInt((match[2] || "").padEnd(2, "0") || "0")
  ).toString();
}

function cashierAssignments(access) {
  return (access?.branches || []).filter((row) => row.role === "CASHIER");
}

const PAYMENT_METHODS = ["CASH", "CARD", "UPI", "OTHER"];
const EMPTY_SPLIT = { CASH: "", CARD: "", UPI: "", OTHER: "" };

export default function CashierWorkspace({ token, access }) {
  const assignments = useMemo(() => cashierAssignments(access), [access]);
  const [tab, setTab] = useState("Sell");
  const [membershipId, setMembershipId] = useState(
    assignments[0]?.membershipId || "",
  );
  const membership =
    assignments.find((row) => row.membershipId === membershipId) ||
    assignments[0] ||
    null;
  const tenantId = membership?.tenantId || "";
  const branchId = membership?.branchId || "";
  const branch = membership?.branch || null;
  const salesBase =
    tenantId && branchId
      ? `/sales/cashier/tenants/${tenantId}/branches/${branchId}`
      : "";
  const restaurantBase =
    tenantId && branchId && branch?.type === "BAR_RESTAURANT"
      ? `/restaurant/cashier/tenants/${tenantId}/branches/${branchId}`
      : "";

  const shiftBase =
    tenantId && branchId
      ? `/shifts/tenants/${tenantId}/branches/${branchId}`
      : "";
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [summary, setSummary] = useState({
    orderCount: 0,
    salesMinor: "0",
    paymentMix: [],
  });
  const [settlements, setSettlements] = useState([]);
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("UPI");
  const [paymentReference, setPaymentReference] = useState("");
  const [splitPayment, setSplitPayment] = useState(false);
  const [splitAmounts, setSplitAmounts] = useState(EMPTY_SPLIT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [lastReceipt, setLastReceipt] = useState(null);
  const [shift, setShift] = useState(null);
  const [openingFloat, setOpeningFloat] = useState("");
  const [declaredCash, setDeclaredCash] = useState("");
  const [closeNote, setCloseNote] = useState("");
  const [handoverOptions, setHandoverOptions] = useState([]);
  const [handoverToUserId, setHandoverToUserId] = useState("");
  const [offlineCount, setOfflineCount] = useState(offlineSaleCount);

  useEffect(() => {
    if (!assignments.some((row) => row.membershipId === membershipId))
      setMembershipId(assignments[0]?.membershipId || "");
  }, [assignments, membershipId]);

  useEffect(() => {
    const update = () => setOfflineCount(offlineSaleCount());
    const sync = async () => {
      if (!navigator.onLine || !token) return;
      const result = await syncOfflineSales(token);
      setOfflineCount(result.remaining);
      if (result.synced) {
        flash(
          `${result.synced} offline sale${result.synced === 1 ? "" : "s"} synced.`,
        );
        await load();
      }
    };
    window.addEventListener("online", sync);
    window.addEventListener("deva-offline-queue", update);
    sync();
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("deva-offline-queue", update);
    };
  }, [token, salesBase]);

  async function load() {
    if (!salesBase) return;
    try {
      setBusy(true);
      setError("");
      const headers = authHeaders(token);
      const requests = [
        api.get(`${salesBase}/catalogue`, { headers }),
        api.get(`${salesBase}/orders?limit=30`, { headers }),
        api.get(`${salesBase}/summary`, { headers }),
        api.get(`${shiftBase}/current?role=CASHIER`, { headers }),
      ];
      if (restaurantBase)
        requests.push(api.get(`${restaurantBase}/settlements`, { headers }));
      const results = await Promise.all(requests);
      setProducts(results[0].data.products || []);
      setOrders(results[1].data.orders || []);
      setSummary(results[2].data.summary || {});
      setShift(results[3].data.shift || null);
      setHandoverOptions(results[3].data.handoverOptions || []);
      setSettlements(restaurantBase ? results[4]?.data?.settlements || [] : []);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    setCart([]);
    setLastReceipt(null);
    setPaymentReference("");
    load();
  }, [salesBase, restaurantBase]);

  function flash(message) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2400);
  }

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products.filter(
      (product) =>
        product.available !== false &&
        (!query ||
          [product.name, product.brand, product.sku, product.barcode].some(
            (value) =>
              String(value || "")
                .toLowerCase()
                .includes(query),
          )),
    );
  }, [products, search]);

  function add(product, price) {
    setCart((current) => {
      const existing = current.find((row) => row.priceOptionId === price.id);
      if (existing)
        return current.map((row) =>
          row.priceOptionId === price.id
            ? { ...row, quantityUnits: row.quantityUnits + 1 }
            : row,
        );
      return [
        ...current,
        {
          priceOptionId: price.id,
          productName: product.name,
          priceLabel: price.label,
          priceMinor: price.priceMinor,
          quantityUnits: 1,
        },
      ];
    });
  }

  function quantity(priceOptionId, next) {
    if (next <= 0)
      return setCart((current) =>
        current.filter((row) => row.priceOptionId !== priceOptionId),
      );
    setCart((current) =>
      current.map((row) =>
        row.priceOptionId === priceOptionId
          ? { ...row, quantityUnits: next }
          : row,
      ),
    );
  }

  const totalMinor = useMemo(
    () =>
      cart.reduce(
        (sum, row) =>
          sum + BigInt(row.priceMinor || 0) * BigInt(row.quantityUnits),
        0n,
      ),
    [cart],
  );
  const splitAllocatedMinor = useMemo(
    () =>
      Object.values(splitAmounts).reduce((sum, value) => {
        if (!String(value).trim()) return sum;
        try {
          return sum + BigInt(minorFromRupees(value));
        } catch (_) {
          return sum;
        }
      }, 0n),
    [splitAmounts],
  );
  const shiftIsOpen = shift?.status === "OPEN";

  function buildPayments(expectedTotalMinor) {
    if (!splitPayment) return null;
    const rows = PAYMENT_METHODS.flatMap((method) => {
      const value = String(splitAmounts[method] || "").trim();
      if (!value) return [];
      const amountMinor = BigInt(minorFromRupees(value));
      return amountMinor > 0n
        ? [
            {
              method,
              amountMinor: amountMinor.toString(),
              reference: paymentReference.trim() || null,
            },
          ]
        : [];
    });
    if (rows.length < 2)
      throw new Error("Enter amounts for at least two payment methods.");
    const allocated = rows.reduce(
      (sum, row) => sum + BigInt(row.amountMinor),
      0n,
    );
    if (allocated !== BigInt(expectedTotalMinor || 0))
      throw new Error(
        `Split payments must equal ${formatMoney(expectedTotalMinor)}. ${formatMoney(allocated)} is allocated.`,
      );
    return rows;
  }

  function clearPaymentEntry() {
    setPaymentReference("");
    setSplitAmounts(EMPTY_SPLIT);
    setSplitPayment(false);
  }

  async function openCashierShift(event) {
    event.preventDefault();
    try {
      setBusy(true);
      setError("");
      await api.post(
        `${shiftBase}/open`,
        {
          role: "CASHIER",
          openingFloatMinor: minorFromRupees(openingFloat || "0"),
          idempotencyKey: crypto.randomUUID(),
        },
        { headers: authHeaders(token) },
      );
      setOpeningFloat("");
      await load();
      flash("Cashier shift opened.");
    } catch (err) {
      setError(err.message || apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitCashierShift(event) {
    event.preventDefault();
    try {
      setBusy(true);
      setError("");
      await api.post(
        `${shiftBase}/${shift.id}/submit`,
        {
          declaredCashMinor: minorFromRupees(declaredCash || "0"),
          closeNote: closeNote || null,
          handedOverToUserId: handoverToUserId || null,
        },
        { headers: authHeaders(token) },
      );
      setDeclaredCash("");
      setCloseNote("");
      setHandoverToUserId("");
      await load();
      flash("Shift submitted for manager approval.");
    } catch (err) {
      setError(err.message || apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function checkout() {
    let checkoutBody = null;
    try {
      if (!cart.length) throw new Error("Add at least one item.");
      const payments = buildPayments(totalMinor);
      setBusy(true);
      setError("");
      checkoutBody = {
        lines: cart.map((row) => ({
          priceOptionId: row.priceOptionId,
          quantityUnits: row.quantityUnits,
        })),
        paymentMethod,
        payments,
        paymentReference: paymentReference.trim() || null,
        idempotencyKey: crypto.randomUUID(),
      };
      const { data } = await api.post(`${salesBase}/checkout`, checkoutBody, {
        headers: authHeaders(token),
      });
      setLastReceipt(data.order || null);
      setCart([]);
      clearPaymentEntry();
      await load();
      flash("Payment received.");
    } catch (err) {
      if (!err.response && checkoutBody) {
        const count = enqueueOfflineSale(`${salesBase}/checkout`, checkoutBody);
        setCart([]);
        clearPaymentEntry();
        setOfflineCount(count);
        flash(
          "Sale saved offline. It will sync automatically when the connection returns.",
        );
      } else setError(err.message || apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function settleRestaurant(order) {
    try {
      const payments = buildPayments(order.totalMinor);
      setBusy(true);
      setError("");
      await api.post(
        `${restaurantBase}/orders/${order.id}/pay`,
        {
          paymentMethod,
          payments,
          paymentReference: paymentReference.trim() || null,
        },
        { headers: authHeaders(token) },
      );
      clearPaymentEntry();
      await load();
      flash(`${order.orderNumber} paid.`);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!assignments.length) {
    return (
      <div className="cashier-page">
        <div className="cashier-empty">
          <Store size={28} />
          <strong>No branch assigned</strong>
          <span>
            Please ask your manager to assign this cashier account to a branch.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="cashier-page">
      <section className="cashier-head">
        <div>
          <div className="cashier-kicker">Billing</div>
          <h1>{branch?.name || "Outlet"}</h1>
          <p>
            Collect restaurant bills and make counter sales. That is all you
            need on this screen.
          </p>
        </div>
        <div className="cashier-head-actions">
          {assignments.length > 1 && (
            <select
              aria-label="Branch"
              value={membership?.membershipId || ""}
              onChange={(event) => setMembershipId(event.target.value)}
            >
              {assignments.map((row) => (
                <option value={row.membershipId} key={row.membershipId}>
                  {row.branch?.name} · {row.branch?.code}
                </option>
              ))}
            </select>
          )}
          <button onClick={load} disabled={busy}>
            <RefreshCw size={15} className={busy ? "spin" : ""} />
            Refresh
          </button>
        </div>
      </section>

      {error && <div className="cashier-message error">{error}</div>}
      {offlineCount > 0 && (
        <div className="cashier-message offline">
          <CloudOff size={14} />
          <span>
            <strong>
              {offlineCount} sale{offlineCount === 1 ? "" : "s"} waiting to
              sync.
            </strong>{" "}
            Keep this device open; retries happen automatically when online.
          </span>
          <button
            onClick={() =>
              syncOfflineSales(token).then((result) => {
                setOfflineCount(result.remaining);
                if (result.synced) load();
              })
            }
          >
            Retry now
          </button>
        </div>
      )}
      {notice && (
        <div className="cashier-message success">
          <CheckCircle2 size={14} />
          {notice}
        </div>
      )}

      {!shift && (
        <form className="cashier-shift-card" onSubmit={openCashierShift}>
          <div>
            <span>Shift required</span>
            <strong>Open your till before billing</strong>
            <small>
              Enter the cash physically placed in the drawer at the start.
            </small>
          </div>
          <label>
            <span>Opening cash ₹</span>
            <input
              value={openingFloat}
              onChange={(event) => setOpeningFloat(event.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              required
            />
          </label>
          <button className="cashier-primary" disabled={busy}>
            <Banknote size={13} />
            Open shift
          </button>
        </form>
      )}
      {shift?.status === "OPEN" && (
        <form
          className="cashier-shift-card is-open"
          onSubmit={submitCashierShift}
        >
          <div>
            <span>
              Shift open ·{" "}
              {new Date(shift.openedAt).toLocaleTimeString("en-IN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <strong>
              Expected drawer{" "}
              {formatMoney(
                shift.liveExpectedCashMinor || shift.openingFloatMinor,
              )}
            </strong>
            <small>
              Opening cash plus cash payments recorded in this shift.
            </small>
          </div>
          <label>
            <span>Counted cash ₹</span>
            <input
              value={declaredCash}
              onChange={(event) => setDeclaredCash(event.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              required
            />
          </label>
          <label>
            <span>Handover to (optional)</span>
            <select
              value={handoverToUserId}
              onChange={(event) => setHandoverToUserId(event.target.value)}
            >
              <option value="">No handover</option>
              {handoverOptions.map((row) => (
                <option key={row.userId} value={row.userId}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Close note</span>
            <input
              value={closeNote}
              onChange={(event) => setCloseNote(event.target.value)}
              placeholder="Handover or variance note"
            />
          </label>
          <button className="cashier-secondary" disabled={busy}>
            Submit close
          </button>
        </form>
      )}
      {shift?.status === "SUBMITTED" && (
        <div className="cashier-shift-card is-submitted">
          <div>
            <span>Shift submitted</span>
            <strong>Waiting for manager approval</strong>
            <small>
              Declared {formatMoney(shift.declaredCashMinor)} · expected{" "}
              {formatMoney(shift.expectedCashMinor)} · variance{" "}
              {formatMoney(shift.varianceMinor)}
            </small>
          </div>
        </div>
      )}

      <div className="cashier-stats">
        <article>
          <span>Sales today</span>
          <strong>{formatMoney(summary.salesMinor)}</strong>
          <small>{summary.orderCount || 0} payments</small>
        </article>
        <article>
          <span>Bills waiting</span>
          <strong>{settlements.length}</strong>
          <small>
            {restaurantBase
              ? "Waiting for payment"
              : "No restaurant bills here"}
          </small>
        </article>
        <article>
          <span>Branch</span>
          <strong>
            {branch?.type === "BAR_RESTAURANT" ? "Restaurant" : "Wine Shop"}
          </strong>
          <small>{branch?.code}</small>
        </article>
      </div>

      <div className="workspace-tabs">
        {[
          { label: "Sell", icon: Banknote },
          { label: "History", icon: ReceiptText },
        ].map(({ label, icon: Icon }) => (
          <button
            key={label}
            className={tab === label ? "is-active" : ""}
            onClick={() => setTab(label)}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {tab === "Sell" && (
        <>
          {restaurantBase && (
            <section className="cashier-panel cashier-bills-first">
              <div className="cashier-panel-head">
                <div>
                  <span>First</span>
                  <h2>Bills to collect</h2>
                </div>
                <div className="cashier-payment-select">
                  <CreditCard size={14} />
                  <select
                    aria-label="Payment method"
                    value={paymentMethod}
                    onChange={(event) => setPaymentMethod(event.target.value)}
                    disabled={splitPayment}
                  >
                    <option>UPI</option>
                    <option>CASH</option>
                    <option>CARD</option>
                    <option>OTHER</option>
                  </select>
                </div>
              </div>
              <div className="cashier-payment-mode">
                <label>
                  <input
                    type="checkbox"
                    checked={splitPayment}
                    onChange={(event) => {
                      setSplitPayment(event.target.checked);
                      setSplitAmounts(EMPTY_SPLIT);
                    }}
                  />
                  Split payment
                </label>
                {splitPayment && (
                  <div className="cashier-split-grid">
                    {PAYMENT_METHODS.map((method) => (
                      <label key={method}>
                        <span>{method} ₹</span>
                        <input
                          value={splitAmounts[method]}
                          onChange={(event) =>
                            setSplitAmounts({
                              ...splitAmounts,
                              [method]: event.target.value,
                            })
                          }
                          inputMode="decimal"
                          placeholder="0.00"
                        />
                      </label>
                    ))}
                    <div className="cashier-split-summary">
                      <span>Allocated</span>
                      <strong>{formatMoney(splitAllocatedMinor)}</strong>
                    </div>
                  </div>
                )}
              </div>
              {!settlements.length ? (
                <div className="cashier-empty compact">
                  <CheckCircle2 size={22} />
                  <strong>No bills waiting</strong>
                  <span>When a waiter sends a bill, it will appear here.</span>
                </div>
              ) : (
                <div className="cashier-settlements">
                  {settlements.map((order) => (
                    <article key={order.id}>
                      <div className="cashier-settlement-top">
                        <div>
                          <span>{order.table?.name || "Table"}</span>
                          <strong>{order.orderNumber}</strong>
                        </div>
                        <strong>{formatMoney(order.totalMinor)}</strong>
                      </div>
                      <div className="cashier-settlement-lines">
                        {(order.lines || [])
                          .filter((line) => line.status !== "CANCELLED")
                          .map((line) => (
                            <div key={line.id}>
                              <span>
                                {line.quantityUnits} ×{" "}
                                {line.productNameSnapshot} ·{" "}
                                {line.priceLabelSnapshot}
                              </span>
                              <strong>
                                {formatMoney(line.lineSubtotalMinor)}
                              </strong>
                            </div>
                          ))}
                      </div>
                      <button
                        className="cashier-primary"
                        onClick={() => settleRestaurant(order)}
                        disabled={busy || !shiftIsOpen}
                      >
                        <Banknote size={13} />
                        {shiftIsOpen
                          ? `Collect ${formatMoney(order.totalMinor)}`
                          : "Open shift to collect"}
                        <ChevronRight size={13} />
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          <div className="cashier-pos-layout">
            <section className="cashier-panel cashier-catalogue">
              <div className="cashier-panel-head">
                <div>
                  <span>New sale</span>
                  <h2>Choose items</h2>
                </div>
                <label className="cashier-search">
                  <Search size={14} />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search item or scan barcode..."
                  />
                </label>
              </div>
              <div className="cashier-products">
                {filteredProducts.map((product) => (
                  <article key={product.id}>
                    <div className="cashier-product-copy">
                      {product.imageUrl ? (
                        <img src={product.imageUrl} alt="" />
                      ) : (
                        <div className="cashier-product-image">
                          {product.productType === "ALCOHOL" ? (
                            <Wine size={18} />
                          ) : (
                            <UtensilsCrossed size={18} />
                          )}
                        </div>
                      )}
                      <div>
                        <strong>{product.name}</strong>
                        <span>
                          {product.brand || product.sku || product.productType}
                        </span>
                      </div>
                    </div>
                    <div className="cashier-price-list">
                      {(product.priceOptions || []).map((price) => (
                        <button
                          key={price.id}
                          onClick={() => add(product, price)}
                        >
                          <span>{price.label}</span>
                          <strong>{formatMoney(price.priceMinor)}</strong>
                          <Plus size={12} />
                        </button>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <aside className="cashier-panel cashier-cart">
              <div className="cashier-panel-head">
                <div>
                  <span>Current sale</span>
                  <h2>Bill</h2>
                </div>
                <ShoppingCart size={18} />
              </div>
              {!cart.length ? (
                <div className="cashier-empty compact">
                  <ShoppingCart size={22} />
                  <strong>No items added</strong>
                  <span>Tap an item price to add it to the bill.</span>
                </div>
              ) : (
                <div className="cashier-cart-lines">
                  {cart.map((row) => (
                    <div key={row.priceOptionId}>
                      <div>
                        <strong>{row.productName}</strong>
                        <span>
                          {row.priceLabel} · {formatMoney(row.priceMinor)}
                        </span>
                      </div>
                      <div className="cashier-qty">
                        <button
                          aria-label="Reduce"
                          onClick={() =>
                            quantity(row.priceOptionId, row.quantityUnits - 1)
                          }
                        >
                          <Minus size={11} />
                        </button>
                        <span>{row.quantityUnits}</span>
                        <button
                          aria-label="Add"
                          onClick={() =>
                            quantity(row.priceOptionId, row.quantityUnits + 1)
                          }
                        >
                          <Plus size={11} />
                        </button>
                      </div>
                      <strong>
                        {formatMoney(
                          BigInt(row.priceMinor || 0) *
                            BigInt(row.quantityUnits),
                        )}
                      </strong>
                    </div>
                  ))}
                </div>
              )}
              <div className="cashier-cart-total">
                <span>Total</span>
                <strong>{formatMoney(totalMinor)}</strong>
              </div>
              <label className="cashier-field">
                <span>How did they pay?</span>
                <select
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value)}
                  disabled={splitPayment}
                >
                  <option>UPI</option>
                  <option>CASH</option>
                  <option>CARD</option>
                  <option>OTHER</option>
                </select>
              </label>
              <div className="cashier-payment-mode compact">
                <label>
                  <input
                    type="checkbox"
                    checked={splitPayment}
                    onChange={(event) => {
                      setSplitPayment(event.target.checked);
                      setSplitAmounts(EMPTY_SPLIT);
                    }}
                  />
                  Split across methods
                </label>
                {splitPayment && (
                  <div className="cashier-split-grid">
                    {PAYMENT_METHODS.map((method) => (
                      <label key={method}>
                        <span>{method} ₹</span>
                        <input
                          value={splitAmounts[method]}
                          onChange={(event) =>
                            setSplitAmounts({
                              ...splitAmounts,
                              [method]: event.target.value,
                            })
                          }
                          inputMode="decimal"
                          placeholder="0.00"
                        />
                      </label>
                    ))}
                    <div className="cashier-split-summary">
                      <span>Allocated / bill</span>
                      <strong>
                        {formatMoney(splitAllocatedMinor)} /{" "}
                        {formatMoney(totalMinor)}
                      </strong>
                    </div>
                  </div>
                )}
              </div>
              <label className="cashier-field">
                <span>Payment reference (optional)</span>
                <input
                  value={paymentReference}
                  onChange={(event) => setPaymentReference(event.target.value)}
                  placeholder="UPI or card reference"
                />
              </label>
              <button
                className="cashier-primary"
                disabled={busy || !cart.length || !shiftIsOpen}
                onClick={checkout}
              >
                <Banknote size={13} />
                {shiftIsOpen
                  ? `Collect ${formatMoney(totalMinor)}`
                  : "Open shift to collect"}
                <ChevronRight size={13} />
              </button>
              {lastReceipt && (
                <div className="cashier-receipt">
                  <ReceiptText size={14} />
                  <div>
                    <strong>{lastReceipt.orderNumber}</strong>
                    <span>Paid · {formatMoney(lastReceipt.totalMinor)}</span>
                  </div>
                </div>
              )}
            </aside>
          </div>
        </>
      )}

      {tab === "History" && (
        <section className="cashier-panel">
          <div className="cashier-panel-head">
            <div>
              <span>Today</span>
              <h2>Recent payments</h2>
            </div>
            <ReceiptText size={18} />
          </div>
          {!orders.length ? (
            <div className="cashier-empty compact">
              <ReceiptText size={22} />
              <strong>No payments yet</strong>
              <span>Your completed counter sales will appear here.</span>
            </div>
          ) : (
            <div className="cashier-recent">
              {orders.map((order) => (
                <article key={order.id}>
                  <div>
                    <strong>{order.orderNumber}</strong>
                    <span>
                      {new Date(order.createdAt).toLocaleString("en-IN", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                  </div>
                  <strong>{formatMoney(order.totalMinor)}</strong>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
