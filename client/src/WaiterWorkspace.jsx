import React, { useEffect, useMemo, useState } from "react";
import {
  Bell,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Table2,
  UtensilsCrossed,
  Wine,
  X,
} from "lucide-react";
import { api, apiErrorMessage, authHeaders } from "./api";
import RefreshButton from "./RefreshButton";
import "./waiter.css";

function formatMoney(value) {
  try {
    const amount = BigInt(value || 0);
    return `₹${(amount / 100n).toLocaleString("en-IN")}.${String(amount % 100n).padStart(2, "0")}`;
  } catch (_) {
    return "₹0.00";
  }
}

function membershipBranches(access) {
  return (access?.branches || []).filter(
    (row) => row.role === "WAITER" && row.branch?.type === "BAR_RESTAURANT",
  );
}

function statusLabel(status) {
  const labels = {
    OPEN: "Order placed",
    SERVED: "Served",
    AWAITING_PAYMENT: "Bill sent",
    PAID: "Paid",
    CANCELLED: "Cancelled",
  };
  return (
    labels[String(status || "").toUpperCase()] ||
    String(status || "")
      .replaceAll("_", " ")
      .toLowerCase()
      .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase())
  );
}

export default function WaiterWorkspace({ token, access }) {
  const assignments = useMemo(() => membershipBranches(access), [access]);
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
  const base =
    tenantId && branchId
      ? `/restaurant/waiter/tenants/${tenantId}/branches/${branchId}`
      : "";
  const shiftBase =
    tenantId && branchId
      ? `/shifts/tenants/${tenantId}/branches/${branchId}`
      : "";
  const notificationBase =
    tenantId && branchId
      ? `/restaurant/tenants/${tenantId}/branches/${branchId}`
      : "";

  const [tables, setTables] = useState([]);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [search, setSearch] = useState("");
  const [tableId, setTableId] = useState("");
  const [targetOrderId, setTargetOrderId] = useState("");
  const [draft, setDraft] = useState([]);
  const [customizer, setCustomizer] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [shift, setShift] = useState(null);
  const [shiftNote, setShiftNote] = useState("");
  const [handoverOptions, setHandoverOptions] = useState([]);
  const [handoverToUserId, setHandoverToUserId] = useState("");
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    if (!assignments.some((row) => row.membershipId === membershipId))
      setMembershipId(assignments[0]?.membershipId || "");
  }, [assignments, membershipId]);

  async function load() {
    if (!base) return;
    try {
      setBusy(true);
      setError("");
      const headers = authHeaders(token);
      const [
        tableResult,
        catalogueResult,
        orderResult,
        shiftResult,
        notificationResult,
      ] = await Promise.all([
        api.get(`${base}/tables`, { headers }),
        api.get(`${base}/catalogue`, { headers }),
        api.get(`${base}/orders`, { headers }),
        api.get(`${shiftBase}/current?role=WAITER`, { headers }),
        api.get(`${notificationBase}/notifications?unread=true`, { headers }),
      ]);
      setTables(tableResult.data.tables || []);
      setProducts(catalogueResult.data.products || []);
      setOrders(orderResult.data.orders || []);
      setShift(shiftResult.data.shift || null);
      setHandoverOptions(shiftResult.data.handoverOptions || []);
      setNotifications(notificationResult.data.notifications || []);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    setTableId("");
    setTargetOrderId("");
    setDraft([]);
    load();
  }, [base]);

  useEffect(() => {
    if (!notificationBase) return undefined;
    const timer = window.setInterval(async () => {
      try {
        const { data } = await api.get(
          `${notificationBase}/notifications?unread=true`,
          { headers: authHeaders(token) },
        );
        setNotifications(data.notifications || []);
      } catch (_) {}
    }, 15000);
    return () => window.clearInterval(timer);
  }, [notificationBase, token]);

  function flash(message) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2400);
  }

  const activeOrders = useMemo(
    () =>
      orders.filter((order) =>
        ["OPEN", "SERVED", "AWAITING_PAYMENT"].includes(order.status),
      ),
    [orders],
  );
  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products.filter(
      (product) =>
        product.available !== false &&
        (!query ||
          [product.name, product.brand, product.productType].some((value) =>
            String(value || "")
              .toLowerCase()
              .includes(query),
          )),
    );
  }, [products, search]);

  function selectTable(table) {
    if (table.activeOrder?.own) {
      setTargetOrderId(table.activeOrder.id);
      setTableId("");
      return;
    }
    if (table.activeOrder?.occupied) return;
    setTargetOrderId("");
    setTableId(table.id);
  }

  function selectOwnOrder(order) {
    setTargetOrderId(order.id);
    setTableId("");
  }

  function addItem(product, price) {
    if (
      (product.modifierGroups || []).length ||
      (product.comboItems || []).length
    ) {
      setCustomizer({ product, price, selections: [], notes: "" });
      return;
    }
    commitItem(product, price, [], "");
  }

  function commitItem(product, price, modifiers, notes) {
    const selected = [...modifiers].sort();
    const modifierMinor = (product.modifierGroups || [])
      .flatMap((group) => group.options || [])
      .filter((option) => selected.includes(String(option.id)))
      .reduce((sum, option) => sum + BigInt(option.priceMinor || 0), 0n);
    const effectivePriceMinor = (
      BigInt(price.priceMinor || 0) + modifierMinor
    ).toString();
    const cartKey = `${price.id}:${selected.join(",")}:${notes.trim()}`;
    setDraft((current) => {
      const existing = current.find((row) => row.cartKey === cartKey);
      if (existing)
        return current.map((row) =>
          row.cartKey === cartKey
            ? { ...row, quantityUnits: row.quantityUnits + 1 }
            : row,
        );
      return [
        ...current,
        {
          cartKey,
          priceOptionId: price.id,
          productName: product.name,
          priceLabel: price.label,
          priceMinor: effectivePriceMinor,
          modifiers: selected,
          modifierLabels: (product.modifierGroups || [])
            .flatMap((group) => group.options || [])
            .filter((option) => selected.includes(String(option.id)))
            .map((option) => option.label),
          notes: notes.trim() || null,
          quantityUnits: 1,
        },
      ];
    });
  }

  function quantity(cartKey, next) {
    if (next <= 0)
      return setDraft((current) =>
        current.filter((row) => row.cartKey !== cartKey),
      );
    setDraft((current) =>
      current.map((row) =>
        row.cartKey === cartKey ? { ...row, quantityUnits: next } : row,
      ),
    );
  }

  const draftTotal = useMemo(
    () =>
      draft.reduce(
        (sum, row) =>
          sum + BigInt(row.priceMinor || 0) * BigInt(row.quantityUnits),
        0n,
      ),
    [draft],
  );
  const shiftIsOpen = shift?.status === "OPEN";

  async function openWaiterShift() {
    try {
      setBusy(true);
      setError("");
      await api.post(
        `${shiftBase}/open`,
        { role: "WAITER", idempotencyKey: crypto.randomUUID() },
        { headers: authHeaders(token) },
      );
      await load();
      flash("Waiter shift started.");
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitWaiterShift() {
    try {
      if (activeOrders.length)
        throw new Error(
          "Send or settle every open table before closing your shift.",
        );
      setBusy(true);
      setError("");
      await api.post(
        `${shiftBase}/${shift.id}/submit`,
        {
          closeNote: shiftNote || null,
          handedOverToUserId: handoverToUserId || null,
        },
        { headers: authHeaders(token) },
      );
      setShiftNote("");
      setHandoverToUserId("");
      await load();
      flash("Shift submitted for manager approval.");
    } catch (err) {
      setError(err.message || apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitOrder() {
    try {
      if (!draft.length) throw new Error("Add at least one item.");
      if (!targetOrderId && !tableId) throw new Error("Choose a table first.");
      setBusy(true);
      setError("");
      const payload = {
        lines: draft.map((row) => ({
          priceOptionId: row.priceOptionId,
          quantityUnits: row.quantityUnits,
          modifiers: row.modifiers,
          notes: row.notes,
        })),
      };
      if (targetOrderId) {
        await api.post(`${base}/orders/${targetOrderId}/lines`, payload, {
          headers: authHeaders(token),
        });
        flash("Items added to the order.");
      } else {
        await api.post(
          `${base}/orders`,
          { ...payload, tableId, idempotencyKey: crypto.randomUUID() },
          { headers: authHeaders(token) },
        );
        flash("Order placed.");
      }
      setDraft([]);
      setTableId("");
      setTargetOrderId("");
      await load();
    } catch (err) {
      setError(err.message || apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(order, status) {
    try {
      setError("");
      await api.post(
        `${base}/orders/${order.id}/status`,
        { status },
        { headers: authHeaders(token) },
      );
      await load();
      flash(
        status === "SERVED"
          ? "Order marked as served."
          : "Bill sent to cashier.",
      );
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function markNotificationRead(notification) {
    try {
      await api.post(
        `${notificationBase}/notifications/${notification.id}/read`,
        {},
        { headers: authHeaders(token) },
      );
      setNotifications((current) =>
        current.filter((row) => row.id !== notification.id),
      );
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  if (!assignments.length) {
    return (
      <div className="waiter-page">
        <div className="waiter-empty">
          <UtensilsCrossed size={28} />
          <strong>No restaurant assigned</strong>
          <span>
            Please ask your manager to assign this waiter account to a
            restaurant branch.
          </span>
        </div>
      </div>
    );
  }

  const selectedTable = tables.find((table) => table.id === tableId);
  const selectedOrder = activeOrders.find(
    (order) => order.id === targetOrderId,
  );

  return (
    <div className="waiter-page">
      <section className="waiter-head">
        <div>
          <div className="waiter-kicker">Take Orders</div>
          <h1>{branch?.name || "Restaurant"}</h1>
          <p>
            Choose a table, add items and place the order. After serving, send
            the bill to the cashier.
          </p>
        </div>
        <div className="waiter-head-actions">
          {assignments.length > 1 && (
            <select
              aria-label="Restaurant"
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
          <RefreshButton
            className=""
            onRefresh={load}
            busy={busy}
            iconSize={15}
          />
        </div>
      </section>

      {error && <div className="waiter-message error">{error}</div>}
      {notice && (
        <div className="waiter-message success">
          <CheckCircle2 size={14} />
          {notice}
        </div>
      )}
      {notifications.length > 0 && (
        <section className="waiter-alerts" aria-live="polite">
          <header>
            <Bell size={15} />
            <strong>Ready for service</strong>
            <span>{notifications.length} new</span>
          </header>
          {notifications.map((notification) => (
            <button
              key={notification.id}
              onClick={() => markNotificationRead(notification)}
            >
              <span>
                <strong>{notification.title}</strong>
                <small>{notification.message}</small>
              </span>
              <CheckCircle2 size={15} />
            </button>
          ))}
        </section>
      )}
      {!shift && (
        <div className="waiter-shift-card">
          <div>
            <span>Shift required</span>
            <strong>Start your waiter shift</strong>
            <small>
              Orders are linked to the staff member responsible for the table.
            </small>
          </div>
          <button
            className="waiter-primary"
            onClick={openWaiterShift}
            disabled={busy}
          >
            Start shift
          </button>
        </div>
      )}
      {shift?.status === "OPEN" && (
        <div className="waiter-shift-card is-open">
          <div>
            <span>
              Shift open ·{" "}
              {new Date(shift.openedAt).toLocaleTimeString("en-IN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <strong>
              {activeOrders.length} active table
              {activeOrders.length === 1 ? "" : "s"}
            </strong>
            <small>Close all your tables before submitting the shift.</small>
          </div>
          <select
            aria-label="Handover to"
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
          <input
            aria-label="Shift close note"
            value={shiftNote}
            onChange={(event) => setShiftNote(event.target.value)}
            placeholder="Handover or close note"
          />
          <button
            className="waiter-shift-close"
            onClick={submitWaiterShift}
            disabled={busy || activeOrders.length > 0}
          >
            Submit close
          </button>
        </div>
      )}
      {shift?.status === "SUBMITTED" && (
        <div className="waiter-shift-card is-submitted">
          <div>
            <span>Shift submitted</span>
            <strong>Waiting for manager approval</strong>
            <small>
              You cannot place new orders until this shift is closed.
            </small>
          </div>
        </div>
      )}

      <section className="waiter-section">
        <div className="waiter-section-head">
          <div>
            <span>Step 1</span>
            <h2>Choose a table</h2>
          </div>
          <small>{tables.length} tables</small>
        </div>
        <div className="waiter-tables">
          {tables.map((table) => {
            const own = Boolean(table.activeOrder?.own);
            const occupied = Boolean(table.activeOrder?.occupied);
            const selected =
              table.id === tableId ||
              (own && table.activeOrder?.id === targetOrderId);
            return (
              <button
                key={table.id}
                className={`waiter-table ${own ? "own" : occupied ? "occupied" : "available"} ${selected ? "selected" : ""}`}
                onClick={() => selectTable(table)}
                disabled={occupied}
              >
                <div className="waiter-table-icon">
                  <Table2 size={19} />
                </div>
                <strong>{table.name}</strong>
                <span>{table.seats} seats</span>
                <small>
                  {own
                    ? `${table.activeOrder.orderNumber} · ${statusLabel(table.activeOrder.status)}`
                    : occupied
                      ? "Busy"
                      : "Available"}
                </small>
              </button>
            );
          })}
        </div>
      </section>

      <div className="waiter-order-layout">
        <section className="waiter-section waiter-menu-panel">
          <div className="waiter-section-head">
            <div>
              <span>Step 2</span>
              <h2>
                {selectedOrder
                  ? `Add items to ${selectedOrder.table?.name || "table"}`
                  : selectedTable
                    ? `Add items for ${selectedTable.name}`
                    : "Add items"}
              </h2>
            </div>
            <label className="waiter-search">
              <Search size={14} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search food or drinks..."
              />
            </label>
          </div>
          <div className="waiter-products">
            {filteredProducts.map((product) => (
              <article className="waiter-product" key={product.id}>
                <div className="waiter-product-copy">
                  {product.imageUrl ? (
                    <img src={product.imageUrl} alt="" />
                  ) : (
                    <div className="waiter-product-image">
                      {product.productType === "ALCOHOL" ? (
                        <Wine size={18} />
                      ) : (
                        <UtensilsCrossed size={18} />
                      )}
                    </div>
                  )}
                  <div>
                    <strong>{product.name}</strong>
                    <span>{product.brand || product.productType}</span>
                  </div>
                </div>
                <div className="waiter-price-list">
                  {(product.priceOptions || []).map((price) => (
                    <button
                      key={price.id}
                      onClick={() => addItem(product, price)}
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

        <aside className="waiter-section waiter-draft">
          <div className="waiter-section-head">
            <div>
              <span>Your order</span>
              <h2>
                {selectedOrder
                  ? "Add more items"
                  : selectedTable
                    ? selectedTable.name
                    : "New order"}
              </h2>
            </div>
            <ShoppingBag size={18} />
          </div>
          {!draft.length ? (
            <div className="waiter-empty compact">
              <ShoppingBag size={22} />
              <strong>No items added</strong>
              <span>Choose a table, then tap a price to add an item.</span>
            </div>
          ) : (
            <div className="waiter-draft-lines">
              {draft.map((row) => (
                <div className="waiter-draft-line" key={row.cartKey}>
                  <div>
                    <strong>{row.productName}</strong>
                    <span>
                      {row.priceLabel} · {formatMoney(row.priceMinor)}
                    </span>
                    {(row.modifierLabels?.length || row.notes) && (
                      <small>
                        {[...(row.modifierLabels || []), row.notes]
                          .filter(Boolean)
                          .join(" · ")}
                      </small>
                    )}
                  </div>
                  <div className="waiter-qty">
                    <button
                      aria-label="Reduce"
                      onClick={() =>
                        quantity(row.cartKey, row.quantityUnits - 1)
                      }
                    >
                      <Minus size={11} />
                    </button>
                    <span>{row.quantityUnits}</span>
                    <button
                      aria-label="Add"
                      onClick={() =>
                        quantity(row.cartKey, row.quantityUnits + 1)
                      }
                    >
                      <Plus size={11} />
                    </button>
                  </div>
                  <strong>
                    {formatMoney(
                      BigInt(row.priceMinor || 0) * BigInt(row.quantityUnits),
                    )}
                  </strong>
                </div>
              ))}
            </div>
          )}
          <div className="waiter-total">
            <span>Total</span>
            <strong>{formatMoney(draftTotal)}</strong>
          </div>
          <button
            className="waiter-primary"
            onClick={submitOrder}
            disabled={
              busy ||
              !shiftIsOpen ||
              !draft.length ||
              (!tableId && !targetOrderId)
            }
          >
            {shiftIsOpen
              ? targetOrderId
                ? "Add items to order"
                : "Place order"
              : "Start shift to place order"}
            <ChevronRight size={15} />
          </button>
        </aside>
      </div>

      <section className="waiter-section">
        <div className="waiter-section-head">
          <div>
            <span>Step 3</span>
            <h2>Serve & send bill</h2>
          </div>
          <small>{activeOrders.length} active</small>
        </div>
        {!activeOrders.length ? (
          <div className="waiter-empty compact">
            <CheckCircle2 size={22} />
            <strong>No open orders</strong>
            <span>Orders you place will appear here.</span>
          </div>
        ) : (
          <div className="waiter-active-orders">
            {activeOrders.map((order) => (
              <article
                key={order.id}
                className={`waiter-order status-${String(order.status).toLowerCase()}`}
              >
                <div className="waiter-order-top">
                  <div>
                    <span>{statusLabel(order.status)}</span>
                    <strong>{order.table?.name || order.orderNumber}</strong>
                    <small>
                      {order.orderNumber} · <Clock3 size={10} />{" "}
                      {new Date(order.createdAt).toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </small>
                  </div>
                  <strong>{formatMoney(order.totalMinor)}</strong>
                </div>
                <div className="waiter-order-lines">
                  {(order.lines || [])
                    .filter((line) => line.status !== "CANCELLED")
                    .map((line) => (
                      <div key={line.id}>
                        <span>
                          {line.quantityUnits} × {line.productNameSnapshot} ·{" "}
                          {line.priceLabelSnapshot}
                        </span>
                        <strong>{formatMoney(line.lineSubtotalMinor)}</strong>
                      </div>
                    ))}
                </div>
                <div className="waiter-order-actions">
                  <button onClick={() => selectOwnOrder(order)}>
                    Add items
                  </button>
                  {order.status === "OPEN" && (
                    <button onClick={() => updateStatus(order, "SERVED")}>
                      Mark served
                    </button>
                  )}
                  {["OPEN", "SERVED"].includes(order.status) && (
                    <button
                      className="bill"
                      onClick={() => updateStatus(order, "AWAITING_PAYMENT")}
                    >
                      Send bill to cashier
                    </button>
                  )}
                  {order.status === "AWAITING_PAYMENT" && (
                    <span className="waiter-awaiting">
                      <Clock3 size={12} />
                      Waiting for payment
                    </span>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      {customizer && (
        <div className="waiter-customizer">
          <button
            className="waiter-customizer-backdrop"
            aria-label="Close"
            onClick={() => setCustomizer(null)}
          />
          <div className="waiter-customizer-card">
            <header>
              <div>
                <span>Customize item</span>
                <h3>
                  {customizer.product.name} · {customizer.price.label}
                </h3>
              </div>
              <button onClick={() => setCustomizer(null)}>
                <X size={17} />
              </button>
            </header>
            {(customizer.product.comboItems || []).length > 0 && (
              <div className="waiter-combo">
                <strong>Combo includes</strong>
                <span>
                  {customizer.product.comboItems
                    .map((item) => `${item.quantity || 1} × ${item.label}`)
                    .join(" · ")}
                </span>
              </div>
            )}
            {(customizer.product.modifierGroups || []).map((group) => (
              <fieldset key={group.id}>
                <legend>
                  {group.name}
                  <small>
                    {group.min > 0
                      ? `Choose ${group.min}${group.max !== group.min ? `-${group.max}` : ""}`
                      : "Optional"}
                  </small>
                </legend>
                {(group.options || []).map((option) => {
                  const checked = customizer.selections.includes(
                    String(option.id),
                  );
                  return (
                    <label key={option.id}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          let next = event.target.checked
                            ? [...customizer.selections, String(option.id)]
                            : customizer.selections.filter(
                                (id) => id !== String(option.id),
                              );
                          const groupIds = new Set(
                            (group.options || []).map((row) => String(row.id)),
                          );
                          const selectedInGroup = next.filter((id) =>
                            groupIds.has(id),
                          );
                          if (
                            selectedInGroup.length >
                            Number(group.max || group.options.length)
                          )
                            return;
                          setCustomizer({ ...customizer, selections: next });
                        }}
                      />
                      <span>{option.label}</span>
                      <strong>
                        {BigInt(option.priceMinor || 0) > 0n
                          ? `+${formatMoney(option.priceMinor)}`
                          : "Included"}
                      </strong>
                    </label>
                  );
                })}
              </fieldset>
            ))}
            <label className="waiter-item-note">
              <span>Kitchen note</span>
              <textarea
                rows="3"
                value={customizer.notes}
                onChange={(event) =>
                  setCustomizer({ ...customizer, notes: event.target.value })
                }
                placeholder="No onion, less ice, allergy note…"
              />
            </label>
            <button
              className="waiter-primary"
              onClick={() => {
                commitItem(
                  customizer.product,
                  customizer.price,
                  customizer.selections,
                  customizer.notes,
                );
                setCustomizer(null);
              }}
            >
              Add customized item
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
