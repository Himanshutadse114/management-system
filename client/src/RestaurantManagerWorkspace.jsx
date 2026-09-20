import React, { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Banknote,
  CalendarDays,
  CheckCircle2,
  ChefHat,
  ClipboardList,
  Copy,
  ExternalLink,
  LayoutGrid,
  Plus,
  QrCode,
  RefreshCw,
  UtensilsCrossed,
  Timer,
  X,
} from "lucide-react";
import { api, apiErrorMessage, authHeaders } from "./api";
import "./restaurant.css";

function formatMoney(value) {
  try {
    const amount = BigInt(value || 0);
    return `₹${(amount / 100n).toLocaleString("en-IN")}.${String(amount % 100n).padStart(2, "0")}`;
  } catch (_) {
    return "₹0.00";
  }
}

function publicMenuUrl(token) {
  const url = new URL("/", window.location.origin);
  url.searchParams.set("menu", token);
  return url.toString();
}

function managerBranches(access) {
  return (access?.branches || []).filter(
    (row) =>
      row.role === "BRANCH_MANAGER" && row.branch?.type === "BAR_RESTAURANT",
  );
}

const PAYMENT_METHODS = ["CASH", "CARD", "UPI", "OTHER"];
const EMPTY_SPLIT = { CASH: "", CARD: "", UPI: "", OTHER: "" };

function ScopeSelector({ token, access, scope, setScope, setBranch }) {
  const isSuperAdmin = Boolean(access?.isSuperAdmin);
  const tenantAdmin = (access?.tenants || []).find(
    (row) => row.role === "TENANT_ADMIN",
  );
  const assignedManagers = useMemo(() => managerBranches(access), [access]);
  const [tenants, setTenants] = useState([]);
  const [branches, setBranches] = useState([]);

  useEffect(() => {
    async function loadTenants() {
      if (isSuperAdmin) {
        const { data } = await api.get("/platform/tenants", {
          headers: authHeaders(token),
        });
        const rows = data.tenants || [];
        setTenants(rows);
        if (!scope.tenantId && rows[0]?.id)
          setScope({ tenantId: rows[0].id, branchId: "" });
      } else if (tenantAdmin) {
        setTenants(
          tenantAdmin.tenant
            ? [tenantAdmin.tenant]
            : [{ id: tenantAdmin.tenantId, name: "Assigned business" }],
        );
        if (!scope.tenantId)
          setScope({ tenantId: tenantAdmin.tenantId, branchId: "" });
      } else {
        const unique = [
          ...new Map(
            assignedManagers.map((row) => [
              row.tenantId,
              {
                id: row.tenantId,
                name: row.branch?.tenantName || "Assigned business",
              },
            ]),
          ).values(),
        ];
        setTenants(unique);
        if (!scope.tenantId && assignedManagers[0])
          setScope({
            tenantId: assignedManagers[0].tenantId,
            branchId: assignedManagers[0].branchId,
          });
      }
    }
    loadTenants().catch(() => {});
  }, [token, isSuperAdmin, tenantAdmin?.tenantId]);

  useEffect(() => {
    async function loadBranches() {
      if (!scope.tenantId) return;
      let rows = [];
      if (isSuperAdmin || tenantAdmin) {
        const { data } = await api.get(`/tenants/${scope.tenantId}/branches`, {
          headers: authHeaders(token),
        });
        rows = (data.branches || []).filter(
          (row) => row.type === "BAR_RESTAURANT",
        );
      } else {
        rows = assignedManagers
          .filter((row) => row.tenantId === scope.tenantId)
          .map((row) => row.branch)
          .filter((row) => row?.type === "BAR_RESTAURANT");
      }
      setBranches(rows);
      let nextBranchId = scope.branchId;
      if (!rows.some((row) => row.id === nextBranchId))
        nextBranchId = rows[0]?.id || "";
      if (nextBranchId !== scope.branchId)
        setScope({ ...scope, branchId: nextBranchId });
      setBranch(rows.find((row) => row.id === nextBranchId) || null);
    }
    loadBranches().catch(() => {});
  }, [
    scope.tenantId,
    scope.branchId,
    token,
    isSuperAdmin,
    tenantAdmin?.tenantId,
  ]);

  return (
    <div className="restaurant-scope">
      <label>
        <span>Business</span>
        <select
          value={scope.tenantId}
          onChange={(event) =>
            setScope({ tenantId: event.target.value, branchId: "" })
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
        <span>Restaurant</span>
        <select
          value={scope.branchId}
          onChange={(event) => {
            const id = event.target.value;
            setScope({ ...scope, branchId: id });
            setBranch(branches.find((row) => row.id === id) || null);
          }}
        >
          {!branches.length && <option value="">No restaurant</option>}
          {branches.map((row) => (
            <option value={row.id} key={row.id}>
              {row.name} · {row.code}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function Empty({ icon: Icon, title, body }) {
  return (
    <div className="restaurant-empty">
      <div>
        <Icon size={20} />
      </div>
      <strong>{title}</strong>
      <span>{body}</span>
    </div>
  );
}

export default function RestaurantManagerWorkspace({ token, access }) {
  const pageRef = useRef(null);
  const [scope, setScope] = useState({ tenantId: "", branchId: "" });
  const [branch, setBranch] = useState(null);
  const [tab, setTab] = useState("Orders");
  const [tables, setTables] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [guestRequests, setGuestRequests] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState("UPI");
  const [splitPayment, setSplitPayment] = useState(false);
  const [splitAmounts, setSplitAmounts] = useState(EMPTY_SPLIT);
  const [tableForm, setTableForm] = useState({
    name: "",
    code: "",
    seats: "4",
  });
  const [menuForm, setMenuForm] = useState({
    productId: "",
    displayName: "",
    sectionName: "Food & Drinks",
    description: "",
    featured: false,
    modifierGroups: [],
    comboItemsText: "",
  });
  const [reservationForm, setReservationForm] = useState({
    guestName: "",
    phone: "",
    email: "",
    partySize: "2",
    startsAt: "",
    durationMinutes: "90",
    tableId: "",
    depositRupees: "",
    depositReference: "",
    notes: "",
    consentToContact: false,
  });
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [tableAction, setTableAction] = useState(null);
  const [recipeTarget, setRecipeTarget] = useState(null);
  const [recipeRows, setRecipeRows] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const base =
    scope.tenantId && scope.branchId
      ? `/restaurant/tenants/${scope.tenantId}/branches/${scope.branchId}`
      : "";
  const customerMenuTable = tables.find((table) => table.qrToken) || null;

  function scrollWorkspaceTop(behavior = "smooth") {
    window.requestAnimationFrame(() => {
      const scrollHost = pageRef.current?.closest(".focused-main, .scorm-main");
      if (scrollHost) scrollHost.scrollTo({ top: 0, behavior });
      else window.scrollTo({ top: 0, behavior });
    });
  }

  function selectTab(label) {
    setTab(label);
    scrollWorkspaceTop("auto");
  }
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

  function buildPayments(expectedTotalMinor) {
    if (!splitPayment) return null;
    const rows = PAYMENT_METHODS.flatMap((method) => {
      const value = String(splitAmounts[method] || "").trim();
      if (!value) return [];
      const amountMinor = BigInt(minorFromRupees(value));
      return amountMinor > 0n
        ? [{ method, amountMinor: amountMinor.toString() }]
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

  async function loadAll() {
    if (!base) return;
    try {
      setBusy(true);
      setError("");
      const headers = authHeaders(token);
      const [
        tableResult,
        menuResult,
        catalogueResult,
        orderResult,
        ticketResult,
        reservationResult,
        notificationResult,
        guestOrderResult,
      ] = await Promise.all([
        api.get(`${base}/tables`, { headers }),
        api.get(`${base}/menu`, { headers }),
        api.get(`${base}/catalogue`, { headers }),
        api.get(`${base}/orders`, { headers }),
        api.get(`${base}/kitchen-tickets`, { headers }),
        api.get(`${base}/reservations`, { headers }),
        api.get(`${base}/notifications?unread=true`, { headers }),
        api.get(`${base}/guest-orders`, { headers }),
      ]);
      setTables(tableResult.data.tables || []);
      setMenuItems(menuResult.data.items || []);
      setProducts(catalogueResult.data.products || []);
      setOrders(orderResult.data.orders || []);
      setTickets(ticketResult.data.tickets || []);
      setReservations(reservationResult.data.reservations || []);
      setNotifications(notificationResult.data.notifications || []);
      setGuestRequests(guestOrderResult.data.requests || []);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, [base]);

  function flash(message) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2500);
  }

  async function markNotificationRead(notification) {
    try {
      await api.post(
        `${base}/notifications/${notification.id}/read`,
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

  const activeOrders = useMemo(
    () =>
      orders.filter((order) =>
        ["OPEN", "SERVED", "AWAITING_PAYMENT"].includes(order.status),
      ),
    [orders],
  );

  async function changeStatus(order, status) {
    try {
      setError("");
      await api.post(
        `${base}/orders/${order.id}/status`,
        { status },
        { headers: authHeaders(token) },
      );
      await loadAll();
      flash(
        status === "SERVED" ? "Order marked served." : "Bill sent for payment.",
      );
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }
  async function changeTicketStatus(ticket, status) {
    try {
      setError("");
      await api.post(
        `${base}/kitchen-tickets/${ticket.id}/status`,
        { status, previous: ticket.status },
        { headers: authHeaders(token) },
      );
      await loadAll();
      flash(
        status === "READY"
          ? "Ticket ready for service."
          : "Kitchen ticket updated.",
      );
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }
  async function createReservation(event) {
    event.preventDefault();
    try {
      setError("");
      await api.post(
        `${base}/reservations`,
        {
          ...reservationForm,
          partySize: Number(reservationForm.partySize),
          durationMinutes: Number(reservationForm.durationMinutes),
          tableId: reservationForm.tableId || null,
          depositMinor: minorFromRupees(reservationForm.depositRupees),
        },
        { headers: authHeaders(token) },
      );
      setReservationForm({
        guestName: "",
        phone: "",
        email: "",
        partySize: "2",
        startsAt: "",
        durationMinutes: "90",
        tableId: "",
        depositRupees: "",
        depositReference: "",
        notes: "",
        consentToContact: false,
      });
      await loadAll();
      flash("Reservation saved.");
    } catch (err) {
      setError(err.message || apiErrorMessage(err));
    }
  }
  async function updateReservation(reservation, status) {
    try {
      setError("");
      await api.patch(
        `${base}/reservations/${reservation.id}`,
        { status },
        { headers: authHeaders(token) },
      );
      await loadAll();
      flash(`Reservation marked ${status.toLowerCase().replaceAll("_", " ")}.`);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }
  async function decideGuestOrder(request, action) {
    try {
      setBusy(true);
      setError("");
      const body =
        action === "reject"
          ? { reason: window.prompt("Reason for rejection") || "Unavailable" }
          : {};
      await api.post(`${base}/guest-orders/${request.id}/${action}`, body, {
        headers: authHeaders(token),
      });
      await loadAll();
      flash(
        action === "accept"
          ? "Guest order accepted and sent to the kitchen."
          : "Guest order rejected.",
      );
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  async function verifyGuestPayment(request) {
    try {
      setBusy(true); setError("");
      await api.post(`${base}/guest-orders/${request.id}/verify-payment`, {}, { headers: authHeaders(token) });
      await loadAll(); flash("UPI reference verified. The order can now be accepted.");
    } catch (err) { setError(apiErrorMessage(err)); }
    finally { setBusy(false); }
  }
  async function pay(order) {
    try {
      setError("");
      const payments = buildPayments(order.totalMinor);
      await api.post(
        `${base}/orders/${order.id}/pay`,
        { paymentMethod, payments },
        { headers: authHeaders(token) },
      );
      setSplitPayment(false);
      setSplitAmounts(EMPTY_SPLIT);
      await loadAll();
      flash(`${order.orderNumber} paid.`);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }
  async function confirmCancel() {
    if (!cancelTarget || !cancelReason.trim()) return;
    try {
      setBusy(true);
      setError("");
      await api.post(
        `${base}/orders/${cancelTarget.id}/cancel`,
        { reason: cancelReason.trim() },
        { headers: authHeaders(token) },
      );
      setCancelTarget(null);
      setCancelReason("");
      await loadAll();
      flash("Order cancelled. Stock was restored automatically.");
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  function openTableAction(mode, order) {
    setTableAction({
      mode,
      order,
      destinationTableId: "",
      targetOrderId: "",
      quantities: Object.fromEntries(
        (order.lines || []).map((line) => [line.id, "0"]),
      ),
    });
  }
  async function submitTableAction() {
    if (!tableAction) return;
    try {
      setBusy(true);
      setError("");
      if (tableAction.mode === "move") {
        if (!tableAction.destinationTableId)
          throw new Error("Choose an empty destination table.");
        await api.post(
          `${base}/orders/${tableAction.order.id}/move`,
          { destinationTableId: tableAction.destinationTableId },
          { headers: authHeaders(token) },
        );
        flash("Order moved to the selected table.");
      } else if (tableAction.mode === "merge") {
        if (!tableAction.targetOrderId)
          throw new Error("Choose the order that should receive this bill.");
        await api.post(
          `${base}/orders/${tableAction.order.id}/merge`,
          { targetOrderId: tableAction.targetOrderId },
          { headers: authHeaders(token) },
        );
        flash("Orders merged into one bill.");
      } else {
        if (!tableAction.destinationTableId)
          throw new Error("Choose an empty table for the new bill.");
        const lines = Object.entries(tableAction.quantities)
          .map(([lineId, quantityUnits]) => ({
            lineId,
            quantityUnits: Number(quantityUnits || 0),
          }))
          .filter((row) => row.quantityUnits > 0);
        if (!lines.length)
          throw new Error("Choose at least one item quantity to split.");
        await api.post(
          `${base}/orders/${tableAction.order.id}/split`,
          {
            destinationTableId: tableAction.destinationTableId,
            lines,
            idempotencyKey: crypto.randomUUID(),
          },
          { headers: authHeaders(token) },
        );
        flash("Selected items moved to a new bill.");
      }
      setTableAction(null);
      await loadAll();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  async function createTable(event) {
    event.preventDefault();
    try {
      setError("");
      await api.post(
        `${base}/tables`,
        { ...tableForm, seats: Number(tableForm.seats || 4) },
        { headers: authHeaders(token) },
      );
      setTableForm({ name: "", code: "", seats: "4" });
      await loadAll();
      flash("Table and QR code created.");
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }
  async function publishMenu(event) {
    event.preventDefault();
    try {
      setError("");
      const product = products.find((row) => row.id === menuForm.productId);
      if (!product) throw new Error("Choose an item.");
      const modifierGroups = menuForm.modifierGroups.map((group) => ({
        ...group,
        min: Number(group.min || 0),
        max: Number(group.max || group.options.length),
        options: group.options
          .filter((option) => option.label.trim())
          .map((option) => ({
            ...option,
            priceMinor: minorFromRupees(option.priceRupees || "0"),
          })),
      }));
      const comboItems = menuForm.comboItemsText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const match = line.match(/^(\d+)\s*[x×]\s*(.+)$/i);
          return {
            label: match ? match[2].trim() : line,
            quantity: match ? Number(match[1]) : 1,
          };
        });
      await api.post(
        `${base}/menu`,
        {
          ...menuForm,
          displayName: menuForm.displayName || product.name,
          modifierGroups,
          comboItems,
        },
        { headers: authHeaders(token) },
      );
      setMenuForm({
        productId: "",
        displayName: "",
        sectionName: "Food & Drinks",
        description: "",
        featured: false,
        modifierGroups: [],
        comboItemsText: "",
      });
      await loadAll();
      flash("Item added to public menu.");
    } catch (err) {
      setError(err.message || apiErrorMessage(err));
    }
  }
  function editMenu(item) {
    setMenuForm({
      productId: item.productId,
      displayName: item.displayName,
      sectionName: item.sectionName,
      description: item.description || "",
      featured: Boolean(item.featured),
      modifierGroups: (item.modifierGroups || []).map((group) => ({
        ...group,
        options: (group.options || []).map((option) => ({
          ...option,
          priceRupees: (Number(option.priceMinor || 0) / 100).toFixed(2),
        })),
      })),
      comboItemsText: (item.comboItems || [])
        .map((row) => `${row.quantity || 1} x ${row.label}`)
        .join("\n"),
    });
    scrollWorkspaceTop();
    flash("Menu item loaded for editing.");
  }
  async function openRecipe(item) {
    try {
      setError("");
      const { data } = await api.get(`${base}/recipes/${item.productId}`, {
        headers: authHeaders(token),
      });
      setRecipeTarget(item);
      setRecipeRows(
        (data.components || []).map((row) => ({
          ...row,
          quantity: row.quantityBasePerUnit,
          waste: row.wastePercent,
        })),
      );
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }
  async function saveRecipe() {
    try {
      setBusy(true);
      setError("");
      await api.put(
        `${base}/recipes/${recipeTarget.productId}`,
        {
          components: recipeRows
            .filter(
              (row) => row.ingredientProductId && Number(row.quantity) > 0,
            )
            .map((row) => ({
              ingredientProductId: row.ingredientProductId,
              priceOptionId: row.priceOptionId || null,
              quantityBasePerUnit: Number(row.quantity),
              wastePercent: Number(row.waste || 0),
            })),
        },
        { headers: authHeaders(token) },
      );
      setRecipeTarget(null);
      setRecipeRows([]);
      flash("Recipe and raw-material consumption saved.");
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  async function toggleMenu(item) {
    try {
      setError("");
      await api.patch(
        `${base}/menu/${item.id}`,
        { active: !item.active },
        { headers: authHeaders(token) },
      );
      await loadAll();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }
  async function copyLink(table) {
    try {
      await navigator.clipboard.writeText(publicMenuUrl(table.qrToken));
      flash(`${table.name} menu link copied.`);
    } catch (_) {
      flash("Could not copy. Open the menu and copy the browser link.");
    }
  }

  if (!scope.branchId)
    return (
      <div className="restaurant-page">
        <div className="restaurant-hero">
          <div>
            <div className="restaurant-mini">Restaurant</div>
            <h2>Choose a restaurant</h2>
            <p>Select the branch you want to manage.</p>
          </div>
        </div>
        <ScopeSelector
          token={token}
          access={access}
          scope={scope}
          setScope={setScope}
          setBranch={setBranch}
        />
        <Empty
          icon={UtensilsCrossed}
          title="No restaurant selected"
          body="Choose one of your assigned restaurant branches."
        />
      </div>
    );

  return (
    <div className="restaurant-page" ref={pageRef}>
      <div className="restaurant-hero">
        <div>
          <div className="restaurant-mini">Restaurant</div>
          <h2>{branch?.name || "Restaurant"}</h2>
          <p>Manage orders, tables, QR menu and bills.</p>
        </div>
        <button
          className="scorm-button-secondary"
          onClick={loadAll}
          disabled={busy}
        >
          <RefreshCw size={14} className={busy ? "spin" : ""} />
          Refresh
        </button>
      </div>
      <ScopeSelector
        token={token}
        access={access}
        scope={scope}
        setScope={setScope}
        setBranch={setBranch}
      />
      {error && <div className="restaurant-error">{error}</div>}
      {notice && <div className="restaurant-notice">{notice}</div>}
      {notifications.length > 0 && (
        <section className="restaurant-alerts" aria-live="polite">
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
      <div className="workspace-tabs">
        {[
          { label: "Orders", icon: ClipboardList },
          { label: "Kitchen", icon: ChefHat },
          { label: "Guest Orders", icon: ClipboardList },
          { label: "Reservations", icon: CalendarDays },
          { label: "Tables", icon: QrCode },
          { label: "Menu", icon: UtensilsCrossed },
        ].map(({ label, icon: Icon }) => (
          <button
            key={label}
            className={tab === label ? "is-active" : ""}
            onClick={() => selectTab(label)}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {tab === "Orders" && (
        <section className="restaurant-panel active-orders">
          <div className="restaurant-panel-head">
            <div>
              <div className="restaurant-mini">Open orders</div>
              <h3>Orders & bills</h3>
              <p className="restaurant-panel-note">
                Waiters take the order at the table. This view is for serving
                status, bills and payment.
              </p>
            </div>
            <div className="payment-entry">
              <div className="payment-method">
                <span>Payment method</span>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  disabled={splitPayment}
                >
                  <option>UPI</option>
                  <option>CASH</option>
                  <option>CARD</option>
                  <option>OTHER</option>
                </select>
              </div>
              <label className="split-toggle">
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
            </div>
          </div>
          {splitPayment && (
            <div className="restaurant-split-payment">
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
              <div>
                <span>Allocated</span>
                <strong>{formatMoney(splitAllocatedMinor)}</strong>
              </div>
            </div>
          )}
          {!activeOrders.length ? (
            <Empty
              icon={CheckCircle2}
              title="No open orders"
              body="All table orders are complete."
            />
          ) : (
            <div className="order-card-grid">
              {activeOrders.map((order) => (
                <article
                  className={`active-order status-${String(order.status).toLowerCase()}`}
                  key={order.id}
                >
                  <div className="active-order-top">
                    <div>
                      <span className="order-status">
                        {String(order.status).replaceAll("_", " ")}
                      </span>
                      <strong>{order.orderNumber}</strong>
                      <small>
                        {order.table?.name || "Table"} ·{" "}
                        {order.waiter?.name || order.waiter?.email || "Manager"}
                      </small>
                    </div>
                    <strong className="order-total">
                      {formatMoney(order.totalMinor)}
                    </strong>
                  </div>
                  <div className="active-order-lines">
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
                  <div className="active-order-actions">
                    {order.status === "OPEN" && (
                      <button onClick={() => changeStatus(order, "SERVED")}>
                        Mark served
                      </button>
                    )}
                    {["OPEN", "SERVED"].includes(order.status) && (
                      <button
                        onClick={() => changeStatus(order, "AWAITING_PAYMENT")}
                      >
                        Send bill
                      </button>
                    )}
                    {order.status === "AWAITING_PAYMENT" && (
                      <button className="pay" onClick={() => pay(order)}>
                        <Banknote size={12} />
                        Mark paid · {splitPayment ? "SPLIT" : paymentMethod}
                      </button>
                    )}
                    <button
                      className="utility"
                      onClick={() => openTableAction("move", order)}
                    >
                      Move table
                    </button>
                    <button
                      className="utility"
                      onClick={() => openTableAction("split", order)}
                    >
                      Split bill
                    </button>
                    {activeOrders.length > 1 && (
                      <button
                        className="utility"
                        onClick={() => openTableAction("merge", order)}
                      >
                        Merge bill
                      </button>
                    )}
                    <button
                      className="cancel"
                      onClick={() => {
                        setCancelTarget(order);
                        setCancelReason("");
                      }}
                    >
                      Cancel order
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === "Kitchen" && (
        <section className="kds-board">
          <div className="kds-head">
            <div>
              <div className="restaurant-mini">Kitchen display</div>
              <h3>Live KOT queue</h3>
              <p>
                Every new order round creates a station ticket automatically.
              </p>
            </div>
            <span>{tickets.length} active</span>
          </div>
          {!tickets.length ? (
            <Empty
              icon={ChefHat}
              title="Kitchen queue is clear"
              body="New food and bar tickets will appear automatically."
            />
          ) : (
            <div className="kds-columns">
              {["NEW", "PREPARING", "READY"].map((status) => (
                <div
                  className={`kds-column status-${status.toLowerCase()}`}
                  key={status}
                >
                  <header>
                    <strong>
                      {status === "NEW"
                        ? "New"
                        : status === "PREPARING"
                          ? "Preparing"
                          : "Ready"}
                    </strong>
                    <span>
                      {
                        tickets.filter((ticket) => ticket.status === status)
                          .length
                      }
                    </span>
                  </header>
                  <div>
                    {tickets
                      .filter((ticket) => ticket.status === status)
                      .map((ticket) => {
                        const age = Math.max(
                          0,
                          Math.floor(
                            (Date.now() - new Date(ticket.firedAt).getTime()) /
                              60000,
                          ),
                        );
                        return (
                          <article className="kds-ticket" key={ticket.id}>
                            <div className="kds-ticket-top">
                              <span>
                                {ticket.station} · round {ticket.roundNumber}
                              </span>
                              <strong>
                                {ticket.order?.table?.name ||
                                  ticket.order?.orderNumber ||
                                  "Order"}
                              </strong>
                              <small>
                                <Timer size={12} />
                                {age} min
                              </small>
                            </div>
                            <div className="kds-lines">
                              {(ticket.lines || []).map((line) => (
                                <div key={line.id}>
                                  <strong>{line.quantityUnits}×</strong>
                                  <span>{line.itemNameSnapshot}</span>
                                </div>
                              ))}
                            </div>
                            <div className="kds-actions">
                              {status === "NEW" && (
                                <button
                                  onClick={() =>
                                    changeTicketStatus(ticket, "PREPARING")
                                  }
                                >
                                  Start
                                </button>
                              )}
                              {status === "PREPARING" && (
                                <button
                                  onClick={() =>
                                    changeTicketStatus(ticket, "READY")
                                  }
                                >
                                  Mark ready
                                </button>
                              )}
                              {status === "READY" && (
                                <button
                                  onClick={() =>
                                    changeTicketStatus(ticket, "COMPLETED")
                                  }
                                >
                                  Complete
                                </button>
                              )}
                            </div>
                          </article>
                        );
                      })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
      {tab === "Guest Orders" && (
        <section className="restaurant-panel guest-order-queue">
          <div className="restaurant-panel-head">
            <div>
              <div className="restaurant-mini">QR requests</div>
              <h3>Guest orders awaiting acceptance</h3>
              <p className="restaurant-panel-note">
                Review availability before sending a guest order to the kitchen.
              </p>
            </div>
            <span>
              {guestRequests.filter((row) => row.status === "PENDING").length}{" "}
              pending
            </span>
          </div>
          <div className="guest-order-grid">
            {!guestRequests.length && (
              <Empty
                icon={CheckCircle2}
                title="No guest orders"
                body="Orders submitted from table QR menus appear here."
              />
            )}
            {guestRequests.map((request) => (
              <article
                key={request.id}
                className={`status-${request.status.toLowerCase()}`}
              >
                <header>
                  <div>
                    <span>
                      {request.status} · {request.channel}
                    </span>
                    <strong>
                      {request.guestName || request.phone || "Table guest"}
                    </strong>
                    <small>
                      {tables.find((table) => table.id === request.tableId)
                        ?.name || "Direct order"}{" "}
                      ·{" "}
                      {new Date(request.createdAt).toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </small>
                  </div>
                  <strong>{formatMoney(request.subtotalMinor)}</strong>
                </header>
                <div>
                  {(request.cart || []).map((line, index) => (
                    <p key={`${line.priceOptionId}-${index}`}>
                      <span>
                        {line.quantityUnits} × {line.name} · {line.priceLabel}
                        {line.modifiers?.length
                          ? ` · ${line.modifiers.map((row) => row.label).join(", ")}`
                          : ""}
                      </span>
                      <strong>
                        {formatMoney(
                          BigInt(line.unitMinor || 0) *
                            BigInt(line.quantityUnits || 0),
                        )}
                      </strong>
                    </p>
                  ))}
                </div>
                {request.paymentMethod === "UPI" && <div className="guest-payment-proof"><span>UPI reference</span><strong>{request.paymentReference || "Not supplied"}</strong><em>{request.paymentStatus}</em></div>}
                {request.status === "PENDING" && (
                  <footer>
                    <button
                      className="cancel"
                      disabled={busy}
                      onClick={() => decideGuestOrder(request, "reject")}
                    >
                      Reject
                    </button>
                    {request.paymentStatus === "AWAITING_VERIFICATION" && <button className="secondary" disabled={busy} onClick={() => verifyGuestPayment(request)}>Verify UPI</button>}
                    <button
                      className="pay"
                      disabled={busy || request.paymentStatus === "AWAITING_VERIFICATION"}
                      onClick={() => decideGuestOrder(request, "accept")}
                    >
                      Accept & fire KOT
                    </button>
                  </footer>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {tab === "Reservations" && (
        <div className="restaurant-two-column reservation-layout">
          <form
            className="restaurant-panel restaurant-form"
            onSubmit={createReservation}
          >
            <div className="restaurant-panel-head">
              <div>
                <div className="restaurant-mini">Booking</div>
                <h3>New reservation or waitlist</h3>
              </div>
              <CalendarDays size={18} />
            </div>
            <div className="form-pair">
              <label>
                <span>Guest name</span>
                <input
                  value={reservationForm.guestName}
                  onChange={(e) =>
                    setReservationForm({
                      ...reservationForm,
                      guestName: e.target.value,
                    })
                  }
                  required
                />
              </label>
              <label>
                <span>Phone</span>
                <input
                  value={reservationForm.phone}
                  onChange={(e) =>
                    setReservationForm({
                      ...reservationForm,
                      phone: e.target.value,
                    })
                  }
                  required
                />
              </label>
            </div>
            <div className="form-pair">
              <label>
                <span>Party size</span>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={reservationForm.partySize}
                  onChange={(e) =>
                    setReservationForm({
                      ...reservationForm,
                      partySize: e.target.value,
                    })
                  }
                  required
                />
              </label>
              <label>
                <span>Start</span>
                <input
                  type="datetime-local"
                  value={reservationForm.startsAt}
                  onChange={(e) =>
                    setReservationForm({
                      ...reservationForm,
                      startsAt: e.target.value,
                    })
                  }
                  required
                />
              </label>
            </div>
            <div className="form-pair">
              <label>
                <span>Duration (minutes)</span>
                <input
                  type="number"
                  min="15"
                  step="15"
                  value={reservationForm.durationMinutes}
                  onChange={(e) =>
                    setReservationForm({
                      ...reservationForm,
                      durationMinutes: e.target.value,
                    })
                  }
                />
              </label>
              <label>
                <span>Assign table</span>
                <select
                  value={reservationForm.tableId}
                  onChange={(e) =>
                    setReservationForm({
                      ...reservationForm,
                      tableId: e.target.value,
                    })
                  }
                >
                  <option value="">Waitlist / assign later</option>
                  {tables.map((table) => (
                    <option key={table.id} value={table.id}>
                      {table.name} · {table.seats} seats
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-pair">
              <label>
                <span>Deposit ₹</span>
                <input
                  value={reservationForm.depositRupees}
                  onChange={(e) =>
                    setReservationForm({
                      ...reservationForm,
                      depositRupees: e.target.value,
                    })
                  }
                  inputMode="decimal"
                  placeholder="0.00"
                />
              </label>
              <label>
                <span>Deposit reference</span>
                <input
                  value={reservationForm.depositReference}
                  onChange={(e) =>
                    setReservationForm({
                      ...reservationForm,
                      depositReference: e.target.value,
                    })
                  }
                />
              </label>
            </div>
            <label>
              <span>Email (optional)</span>
              <input
                type="email"
                value={reservationForm.email}
                onChange={(e) =>
                  setReservationForm({
                    ...reservationForm,
                    email: e.target.value,
                  })
                }
              />
            </label>
            <label>
              <span>Notes</span>
              <textarea
                rows="3"
                value={reservationForm.notes}
                onChange={(e) =>
                  setReservationForm({
                    ...reservationForm,
                    notes: e.target.value,
                  })
                }
              />
            </label>
            <label className="featured-check">
              <input
                type="checkbox"
                checked={reservationForm.consentToContact}
                onChange={(e) =>
                  setReservationForm({
                    ...reservationForm,
                    consentToContact: e.target.checked,
                  })
                }
              />
              <span>Guest consented to booking reminders</span>
            </label>
            <button className="scorm-button-primary restaurant-submit">
              <Plus size={14} />
              Save booking
            </button>
          </form>
          <section className="restaurant-panel">
            <div className="restaurant-panel-head">
              <div>
                <div className="restaurant-mini">Calendar</div>
                <h3>Upcoming reservations</h3>
              </div>
              <span>{reservations.length}</span>
            </div>
            <div className="reservation-list">
              {!reservations.length && (
                <Empty
                  icon={CalendarDays}
                  title="No upcoming bookings"
                  body="Reservations and waitlist entries will appear here."
                />
              )}
              {reservations.map((reservation) => {
                const table = tables.find(
                  (row) => row.id === reservation.tableId,
                );
                return (
                  <article key={reservation.id}>
                    <div>
                      <span>
                        {reservation.status} ·{" "}
                        {new Date(reservation.startsAt).toLocaleString("en-IN")}
                      </span>
                      <strong>
                        {reservation.guestName} · {reservation.partySize} guests
                      </strong>
                      <small>
                        {table?.name || "Waitlist"} · {reservation.phone} ·
                        deposit {formatMoney(reservation.depositMinor)}
                      </small>
                    </div>
                    <div>
                      {["WAITLIST", "BOOKED"].includes(reservation.status) && (
                        <button
                          onClick={() =>
                            updateReservation(reservation, "CONFIRMED")
                          }
                        >
                          Confirm
                        </button>
                      )}
                      {reservation.status === "CONFIRMED" && (
                        <button
                          onClick={() =>
                            updateReservation(reservation, "SEATED")
                          }
                        >
                          Seat
                        </button>
                      )}
                      {reservation.status === "SEATED" && (
                        <button
                          onClick={() =>
                            updateReservation(reservation, "COMPLETED")
                          }
                        >
                          Complete
                        </button>
                      )}
                      {!["COMPLETED", "CANCELLED", "NO_SHOW"].includes(
                        reservation.status,
                      ) && (
                        <button
                          className="muted"
                          onClick={() =>
                            updateReservation(reservation, "NO_SHOW")
                          }
                        >
                          No-show
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {tab === "Tables" && (
        <div className="restaurant-two-column">
          <form
            className="restaurant-panel restaurant-form"
            onSubmit={createTable}
          >
            <div className="restaurant-panel-head">
              <div>
                <div className="restaurant-mini">Add table</div>
                <h3>New table</h3>
              </div>
              <LayoutGrid size={18} />
            </div>
            <label>
              <span>Table name</span>
              <input
                value={tableForm.name}
                onChange={(e) =>
                  setTableForm({ ...tableForm, name: e.target.value })
                }
                placeholder="Table 01"
                required
              />
            </label>
            <div className="form-pair">
              <label>
                <span>Short code</span>
                <input
                  value={tableForm.code}
                  onChange={(e) =>
                    setTableForm({ ...tableForm, code: e.target.value })
                  }
                  placeholder="T01"
                  required
                />
              </label>
              <label>
                <span>Seats</span>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={tableForm.seats}
                  onChange={(e) =>
                    setTableForm({ ...tableForm, seats: e.target.value })
                  }
                />
              </label>
            </div>
            <button className="scorm-button-primary restaurant-submit">
              <Plus size={14} />
              Add table & QR
            </button>
          </form>
          <section className="restaurant-panel">
            <div className="restaurant-panel-head">
              <div>
                <div className="restaurant-mini">Table menu QR</div>
                <h3>QR codes</h3>
              </div>
              <span>{tables.length} tables</span>
            </div>
            <div className="qr-grid">
              {!tables.length && (
                <Empty
                  icon={QrCode}
                  title="No customer QR yet"
                  body="Create your first table. Deva will generate a QR code and customer menu link automatically."
                />
              )}
              {tables.map((table) => {
                const url = publicMenuUrl(table.qrToken);
                return (
                  <article className="qr-card" key={table.id}>
                    <div className="qr-canvas">
                      <QRCodeSVG
                        value={url}
                        size={116}
                        level="M"
                        bgColor="#ffffff"
                        fgColor="#111111"
                      />
                    </div>
                    <div>
                      <strong>{table.name}</strong>
                      <span>
                        {table.code} · {table.seats} seats
                      </span>
                      <small>
                        {table.activeOrder
                          ? `Order: ${table.activeOrder.orderNumber}`
                          : "Available"}
                      </small>
                    </div>
                    <div className="qr-actions">
                      <button type="button" onClick={() => copyLink(table)}>
                        <Copy size={13} />
                        Copy link
                      </button>
                      <a href={url} target="_blank" rel="noreferrer">
                        <ExternalLink size={13} />
                        Open menu
                      </a>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {tab === "Menu" && (
        <>
          <section className="customer-menu-guide">
            <div className="customer-menu-guide-icon">
              <QrCode size={21} />
            </div>
            <div className="customer-menu-guide-copy">
              <strong>Customer menu preview</strong>
              <span>
                Guests scan a table QR code to view this menu and place their
                order. No customer login is required.
              </span>
            </div>
            <div className="customer-menu-guide-actions">
              {customerMenuTable ? (
                <>
                  <a
                    href={publicMenuUrl(customerMenuTable.qrToken)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink size={14} />
                    Open customer menu
                  </a>
                  <button
                    type="button"
                    onClick={() => copyLink(customerMenuTable)}
                  >
                    <Copy size={14} />
                    Copy customer link
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => selectTab("Tables")}>
                  <Plus size={14} />
                  Create table QR
                </button>
              )}
            </div>
          </section>
          <div className="restaurant-two-column">
          <form
            className="restaurant-panel restaurant-form"
            onSubmit={publishMenu}
          >
            <div className="restaurant-panel-head">
              <div>
                <div className="restaurant-mini">Add menu item</div>
                <h3>Add item to QR menu</h3>
              </div>
              <UtensilsCrossed size={18} />
            </div>
            <label>
              <span>Item</span>
              <select
                value={menuForm.productId}
                onChange={(e) => {
                  const product = products.find(
                    (row) => row.id === e.target.value,
                  );
                  setMenuForm({
                    ...menuForm,
                    productId: e.target.value,
                    displayName: product?.name || "",
                  });
                }}
                required
              >
                <option value="">Choose item</option>
                {products.map((product) => (
                  <option value={product.id} key={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Name shown to guest</span>
              <input
                value={menuForm.displayName}
                onChange={(e) =>
                  setMenuForm({ ...menuForm, displayName: e.target.value })
                }
              />
            </label>
            <label>
              <span>Menu section</span>
              <input
                value={menuForm.sectionName}
                onChange={(e) =>
                  setMenuForm({ ...menuForm, sectionName: e.target.value })
                }
                placeholder="Whisky, Starters, Main Course..."
              />
            </label>
            <label>
              <span>Description</span>
              <textarea
                rows="4"
                value={menuForm.description}
                onChange={(e) =>
                  setMenuForm({ ...menuForm, description: e.target.value })
                }
              />
            </label>
            <div className="menu-config-builder">
              <div className="menu-config-head">
                <div>
                  <strong>Modifier groups</strong>
                  <span>Add-ons and required choices shown to waiters.</span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setMenuForm({
                      ...menuForm,
                      modifierGroups: [
                        ...menuForm.modifierGroups,
                        {
                          id: crypto.randomUUID(),
                          name: "",
                          min: 0,
                          max: 1,
                          options: [],
                        },
                      ],
                    })
                  }
                >
                  <Plus size={12} />
                  Group
                </button>
              </div>
              {menuForm.modifierGroups.map((group, groupIndex) => (
                <div className="modifier-builder" key={group.id}>
                  <div className="modifier-builder-head">
                    <input
                      value={group.name}
                      onChange={(event) => {
                        const groups = [...menuForm.modifierGroups];
                        groups[groupIndex] = {
                          ...group,
                          name: event.target.value,
                        };
                        setMenuForm({ ...menuForm, modifierGroups: groups });
                      }}
                      placeholder="Choice name, e.g. Add cheese"
                    />
                    <label>
                      <span>Min</span>
                      <input
                        type="number"
                        min="0"
                        value={group.min}
                        onChange={(event) => {
                          const groups = [...menuForm.modifierGroups];
                          groups[groupIndex] = {
                            ...group,
                            min: event.target.value,
                          };
                          setMenuForm({ ...menuForm, modifierGroups: groups });
                        }}
                      />
                    </label>
                    <label>
                      <span>Max</span>
                      <input
                        type="number"
                        min="1"
                        value={group.max}
                        onChange={(event) => {
                          const groups = [...menuForm.modifierGroups];
                          groups[groupIndex] = {
                            ...group,
                            max: event.target.value,
                          };
                          setMenuForm({ ...menuForm, modifierGroups: groups });
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      aria-label="Remove group"
                      onClick={() =>
                        setMenuForm({
                          ...menuForm,
                          modifierGroups: menuForm.modifierGroups.filter(
                            (_, index) => index !== groupIndex,
                          ),
                        })
                      }
                    >
                      <X size={13} />
                    </button>
                  </div>
                  {group.options.map((option, optionIndex) => (
                    <div className="modifier-option" key={option.id}>
                      <input
                        value={option.label}
                        onChange={(event) => {
                          const groups = [...menuForm.modifierGroups];
                          const options = [...group.options];
                          options[optionIndex] = {
                            ...option,
                            label: event.target.value,
                          };
                          groups[groupIndex] = { ...group, options };
                          setMenuForm({ ...menuForm, modifierGroups: groups });
                        }}
                        placeholder="Option label"
                      />
                      <label>
                        <span>Extra ₹</span>
                        <input
                          value={option.priceRupees}
                          inputMode="decimal"
                          onChange={(event) => {
                            const groups = [...menuForm.modifierGroups];
                            const options = [...group.options];
                            options[optionIndex] = {
                              ...option,
                              priceRupees: event.target.value,
                            };
                            groups[groupIndex] = { ...group, options };
                            setMenuForm({
                              ...menuForm,
                              modifierGroups: groups,
                            });
                          }}
                          placeholder="0.00"
                        />
                      </label>
                      <button
                        type="button"
                        aria-label="Remove option"
                        onClick={() => {
                          const groups = [...menuForm.modifierGroups];
                          groups[groupIndex] = {
                            ...group,
                            options: group.options.filter(
                              (_, index) => index !== optionIndex,
                            ),
                          };
                          setMenuForm({ ...menuForm, modifierGroups: groups });
                        }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="add-option"
                    onClick={() => {
                      const groups = [...menuForm.modifierGroups];
                      groups[groupIndex] = {
                        ...group,
                        options: [
                          ...group.options,
                          {
                            id: crypto.randomUUID(),
                            label: "",
                            priceRupees: "0",
                          },
                        ],
                      };
                      setMenuForm({ ...menuForm, modifierGroups: groups });
                    }}
                  >
                    <Plus size={11} />
                    Add option
                  </button>
                </div>
              ))}
            </div>
            <label>
              <span>Combo contents (one per line)</span>
              <textarea
                rows="3"
                value={menuForm.comboItemsText}
                onChange={(event) =>
                  setMenuForm({
                    ...menuForm,
                    comboItemsText: event.target.value,
                  })
                }
                placeholder={"1 x Burger\n1 x Fries\n2 x Soft drink"}
              />
            </label>
            <label className="featured-check">
              <input
                type="checkbox"
                checked={menuForm.featured}
                onChange={(e) =>
                  setMenuForm({ ...menuForm, featured: e.target.checked })
                }
              />
              <span>Show as featured</span>
            </label>
            <button className="scorm-button-primary restaurant-submit">
              <Plus size={14} />
              Add to menu
            </button>
          </form>
          <section className="restaurant-panel">
            <div className="restaurant-panel-head">
              <div>
                <div className="restaurant-mini">Current menu</div>
                <h3>Menu items</h3>
              </div>
              <span>{menuItems.length}</span>
            </div>
            <div className="menu-admin-list">
              {!menuItems.length && (
                <Empty
                  icon={UtensilsCrossed}
                  title="Menu is empty"
                  body="Add items here to show them on the table QR menu."
                />
              )}
              {menuItems.map((item) => (
                <div className="menu-admin-row" key={item.id}>
                  <div>
                    <strong>{item.displayName}</strong>
                    <span>
                      {item.sectionName} ·{" "}
                      {item.product?.brand ||
                        item.product?.productType ||
                        "Item"}
                    </span>
                    <div className="menu-price-chips">
                      {(item.product?.priceOptions || []).map((price) => (
                        <small key={price.id}>
                          {price.label} {formatMoney(price.priceMinor)}
                        </small>
                      ))}
                    </div>
                  </div>
                  <div className="menu-admin-actions">
                    <button onClick={() => editMenu(item)}>Edit</button>
                    <button onClick={() => openRecipe(item)}>Recipe</button>
                    <button
                      className={item.active ? "is-live" : "is-hidden"}
                      onClick={() => toggleMenu(item)}
                    >
                      {item.active ? "Visible" : "Hidden"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
          </div>
        </>
      )}

      {cancelTarget && (
        <div className="restaurant-modal">
          <button
            className="restaurant-modal-backdrop"
            onClick={() => setCancelTarget(null)}
            aria-label="Close"
          />
          <div className="restaurant-modal-card">
            <div className="restaurant-modal-head">
              <div>
                <div className="restaurant-mini">Cancel order</div>
                <h3>{cancelTarget.orderNumber}</h3>
              </div>
              <button onClick={() => setCancelTarget(null)}>
                <X size={17} />
              </button>
            </div>
            <p>
              The order will stay in history and its stock will be restored
              automatically.
            </p>
            <label>
              <span>Reason for cancellation</span>
              <textarea
                rows="4"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                autoFocus
              />
            </label>
            <div className="restaurant-modal-actions">
              <button
                className="scorm-button-secondary"
                onClick={() => setCancelTarget(null)}
              >
                Keep order
              </button>
              <button
                className="danger-action"
                disabled={!cancelReason.trim() || busy}
                onClick={confirmCancel}
              >
                Cancel order
              </button>
            </div>
          </div>
        </div>
      )}
      {tableAction && (
        <div className="restaurant-modal">
          <button
            className="restaurant-modal-backdrop"
            onClick={() => setTableAction(null)}
            aria-label="Close"
          />
          <div className="restaurant-modal-card table-action-modal">
            <div className="restaurant-modal-head">
              <div>
                <div className="restaurant-mini">{tableAction.mode} bill</div>
                <h3>{tableAction.order.orderNumber}</h3>
              </div>
              <button onClick={() => setTableAction(null)}>
                <X size={17} />
              </button>
            </div>
            {tableAction.mode === "merge" ? (
              <>
                <p>
                  All active items will move into the selected order. The source
                  bill will remain in history as merged.
                </p>
                <label>
                  <span>Merge into</span>
                  <select
                    value={tableAction.targetOrderId}
                    onChange={(event) =>
                      setTableAction({
                        ...tableAction,
                        targetOrderId: event.target.value,
                      })
                    }
                  >
                    <option value="">Choose active bill</option>
                    {activeOrders
                      .filter((row) => row.id !== tableAction.order.id)
                      .map((row) => (
                        <option key={row.id} value={row.id}>
                          {row.table?.name || "Table"} · {row.orderNumber} ·{" "}
                          {formatMoney(row.totalMinor)}
                        </option>
                      ))}
                  </select>
                </label>
              </>
            ) : (
              <>
                <p>
                  {tableAction.mode === "move"
                    ? "Move the complete bill without changing its kitchen or payment history."
                    : "Choose quantities for a new bill. Inventory is not deducted again."}
                </p>
                <label>
                  <span>Empty destination table</span>
                  <select
                    value={tableAction.destinationTableId}
                    onChange={(event) =>
                      setTableAction({
                        ...tableAction,
                        destinationTableId: event.target.value,
                      })
                    }
                  >
                    <option value="">Choose table</option>
                    {tables
                      .filter(
                        (table) =>
                          table.status === "ACTIVE" && !table.activeOrder,
                      )
                      .map((table) => (
                        <option key={table.id} value={table.id}>
                          {table.name} · {table.seats} seats
                        </option>
                      ))}
                  </select>
                </label>
                {tableAction.mode === "split" && (
                  <div className="split-line-list">
                    {(tableAction.order.lines || [])
                      .filter((line) => line.status !== "CANCELLED")
                      .map((line) => (
                        <label key={line.id}>
                          <span>
                            <strong>{line.productNameSnapshot}</strong>
                            <small>
                              {line.quantityUnits} available ·{" "}
                              {formatMoney(line.lineSubtotalMinor)}
                            </small>
                          </span>
                          <input
                            type="number"
                            min="0"
                            max={line.quantityUnits}
                            step="1"
                            value={tableAction.quantities[line.id] || "0"}
                            onChange={(event) =>
                              setTableAction({
                                ...tableAction,
                                quantities: {
                                  ...tableAction.quantities,
                                  [line.id]: event.target.value,
                                },
                              })
                            }
                          />
                        </label>
                      ))}
                  </div>
                )}
              </>
            )}
            <div className="restaurant-modal-actions">
              <button
                className="scorm-button-secondary"
                onClick={() => setTableAction(null)}
              >
                Cancel
              </button>
              <button
                className="scorm-button-primary"
                disabled={busy}
                onClick={submitTableAction}
              >
                {busy
                  ? "Working…"
                  : `${tableAction.mode[0].toUpperCase()}${tableAction.mode.slice(1)} bill`}
              </button>
            </div>
          </div>
        </div>
      )}
      {recipeTarget && (
        <div className="restaurant-modal">
          <button
            className="restaurant-modal-backdrop"
            aria-label="Close"
            onClick={() => setRecipeTarget(null)}
          />
          <div className="restaurant-modal-card recipe-modal">
            <div className="restaurant-modal-head">
              <div>
                <div className="restaurant-mini">Recipe & stock</div>
                <h3>{recipeTarget.displayName}</h3>
              </div>
              <button onClick={() => setRecipeTarget(null)}>
                <X size={17} />
              </button>
            </div>
            <p>
              Each sale consumes these raw materials. Leave the variant blank to
              apply the component to every size.
            </p>
            <div className="recipe-rows">
              {recipeRows.map((row, index) => (
                <div key={row.id || index}>
                  <select
                    value={row.ingredientProductId || ""}
                    onChange={(event) => {
                      const rows = [...recipeRows];
                      rows[index] = {
                        ...row,
                        ingredientProductId: event.target.value,
                      };
                      setRecipeRows(rows);
                    }}
                  >
                    <option value="">Ingredient</option>
                    {products
                      .filter(
                        (product) => product.id !== recipeTarget.productId,
                      )
                      .map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name} ({product.inventoryUnit || "unit"})
                        </option>
                      ))}
                  </select>
                  <select
                    value={row.priceOptionId || ""}
                    onChange={(event) => {
                      const rows = [...recipeRows];
                      rows[index] = {
                        ...row,
                        priceOptionId: event.target.value,
                      };
                      setRecipeRows(rows);
                    }}
                  >
                    <option value="">All variants</option>
                    {(recipeTarget.product?.priceOptions || []).map(
                      (option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ),
                    )}
                  </select>
                  <input
                    value={row.quantity || ""}
                    inputMode="decimal"
                    onChange={(event) => {
                      const rows = [...recipeRows];
                      rows[index] = { ...row, quantity: event.target.value };
                      setRecipeRows(rows);
                    }}
                    placeholder="Qty per sale"
                  />
                  <input
                    value={row.waste || ""}
                    inputMode="decimal"
                    onChange={(event) => {
                      const rows = [...recipeRows];
                      rows[index] = { ...row, waste: event.target.value };
                      setRecipeRows(rows);
                    }}
                    placeholder="Waste %"
                  />
                  <button
                    aria-label="Remove component"
                    onClick={() =>
                      setRecipeRows(
                        recipeRows.filter((_, rowIndex) => rowIndex !== index),
                      )
                    }
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
            <button
              className="recipe-add"
              onClick={() =>
                setRecipeRows([
                  ...recipeRows,
                  {
                    id: crypto.randomUUID(),
                    ingredientProductId: "",
                    priceOptionId: "",
                    quantity: "",
                    waste: "0",
                  },
                ])
              }
            >
              <Plus size={12} />
              Add ingredient
            </button>
            <div className="restaurant-modal-actions">
              <button
                className="scorm-button-secondary"
                onClick={() => setRecipeTarget(null)}
              >
                Cancel
              </button>
              <button
                className="scorm-button-primary"
                disabled={busy}
                onClick={saveRecipe}
              >
                Save recipe
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function minorFromRupees(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "0";
  const match = raw.match(/^(\d+)(?:\.(\d{0,2}))?$/);
  if (!match) throw new Error("Enter a valid deposit amount.");
  return (
    BigInt(match[1]) * 100n +
    BigInt((match[2] || "").padEnd(2, "0") || "0")
  ).toString();
}
