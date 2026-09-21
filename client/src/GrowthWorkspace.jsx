import React, { useEffect, useMemo, useState } from "react";
import {
  BadgePercent,
  Building2,
  Calculator,
  Link2,
  Save,
  Store,
  UsersRound,
} from "lucide-react";
import { api, apiErrorMessage, authHeaders } from "./api";
import RefreshButton from "./RefreshButton";
import "./growth.css";

const empty = {
  customers: [],
  offers: [],
  feedback: [],
  connections: [],
  channelOrders: [],
  payouts: [],
  exports: [],
  guestOrders: [],
  store: null,
};
const rupees = (minor) =>
  `₹${(Number(minor || 0) / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const today = () => new Date().toISOString().slice(0, 10);

export default function GrowthWorkspace({ token, access }) {
  const tenantAdmin = (access?.tenants || []).find(
    (row) => row.role === "TENANT_ADMIN",
  );
  const managers = useMemo(
    () =>
      (access?.branches || []).filter((row) => row.role === "BRANCH_MANAGER"),
    [access],
  );
  const [branches, setBranches] = useState(
    managers
      .map((row) => ({ ...row.branch, tenantId: row.tenantId }))
      .filter(Boolean),
  );
  const [branchId, setBranchId] = useState(managers[0]?.branchId || "");
  const branch = branches.find((row) => row.id === branchId);
  const tenantId =
    branch?.tenantId || tenantAdmin?.tenantId || managers[0]?.tenantId || "";
  const [data, setData] = useState(empty);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [storeForm, setStoreForm] = useState({
    slug: "",
    name: "",
    contactPhone: "",
    active: true,
  });
  const [offer, setOffer] = useState({
    code: "",
    name: "",
    discountType: "PERCENT",
    discountValue: "10",
    minimumSpendMinor: "0",
  });
  const [connection, setConnection] = useState({
    provider: "ZOMATO",
    displayName: "Zomato",
  });
  const [payout, setPayout] = useState({
    provider: "ZOMATO",
    settlementReference: "",
    grossMinor: "",
    feesMinor: "0",
    taxMinor: "0",
    netMinor: "",
    periodStart: today(),
    periodEnd: today(),
  });
  const [exportForm, setExportForm] = useState({
    format: "TALLY_CSV",
    periodStart: today(),
    periodEnd: today(),
  });

  useEffect(() => {
    if (!tenantAdmin) return;
    api
      .get(`/tenants/${tenantAdmin.tenantId}/branches`, {
        headers: authHeaders(token),
      })
      .then(({ data: result }) => {
        const rows = (result.branches || []).map((row) => ({
          ...row,
          tenantId: tenantAdmin.tenantId,
        }));
        setBranches(rows);
        setBranchId((current) =>
          rows.some((row) => row.id === current) ? current : rows[0]?.id || "",
        );
      })
      .catch((err) => setError(apiErrorMessage(err)));
  }, [tenantAdmin?.tenantId, token]);
  async function load() {
    if (!tenantId || !branchId) return;
    try {
      setLoading(true);
      setError("");
      const result = await api.get(
        `/growth/tenants/${tenantId}/branches/${branchId}/overview`,
        { headers: authHeaders(token) },
      );
      setData({ ...empty, ...result.data });
      const current = result.data.store;
      setStoreForm({
        slug: current?.slug || "",
        name: current?.name || branch?.name || "",
        contactPhone: current?.contactPhone || "",
        active: current?.active !== false,
      });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, [tenantId, branchId, token]);
  async function act(request, message) {
    try {
      setLoading(true);
      setError("");
      await request();
      setNotice(message);
      await load();
      window.setTimeout(() => setNotice(""), 2200);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }
  const url = data.store?.slug
    ? `${window.location.origin}/store/${data.store.slug}`
    : "";

  return (
    <div className="growth-page">
      <section className="growth-hero">
        <div>
          <span>Guest growth & channels</span>
          <h2>Direct orders, customers and integrations</h2>
          <p>
            Own the guest relationship, synchronize channels, and reconcile
            every payout.
          </p>
        </div>
        <RefreshButton onRefresh={load} busy={loading} />
      </section>
      <div className="growth-scope">
        <Building2 size={16} />
        <label>
          <span>Branch</span>
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
          >
            {branches.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name} · {row.code}
              </option>
            ))}
          </select>
        </label>
        <strong>
          {branch?.type === "WINE_SHOP" ? "Wine shop" : "Bar + restaurant"}
        </strong>
      </div>
      {error && <div className="growth-alert error">{error}</div>}
      {notice && <div className="growth-alert success">{notice}</div>}
      <div className="growth-metrics">
        <article>
          <UsersRound />
          <strong>{data.customers.length}</strong>
          <span>Customers</span>
        </article>
        <article>
          <BadgePercent />
          <strong>{data.offers.filter((row) => row.active).length}</strong>
          <span>Active offers</span>
        </article>
        <article>
          <Link2 />
          <strong>
            {
              data.connections.filter((row) => row.status === "CONNECTED")
                .length
            }
          </strong>
          <span>Connected channels</span>
        </article>
        <article>
          <Calculator />
          <strong>
            {data.payouts.filter((row) => row.status === "REVIEW").length}
          </strong>
          <span>Payouts to review</span>
        </article>
      </div>
      <div className="growth-grid">
        <section className="growth-card">
          <header>
            <Store />
            <div>
              <span>Direct ordering</span>
              <h3>Storefront & widget</h3>
            </div>
          </header>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              act(
                () =>
                  api.put(
                    `/growth/tenants/${tenantId}/branches/${branchId}/store`,
                    storeForm,
                    { headers: authHeaders(token) },
                  ),
                "Direct store saved.",
              );
            }}
          >
            <label>
              Store URL slug
              <input
                value={storeForm.slug}
                onChange={(e) =>
                  setStoreForm({ ...storeForm, slug: e.target.value })
                }
                placeholder="central-bar"
                required
              />
            </label>
            <label>
              Store name
              <input
                value={storeForm.name}
                onChange={(e) =>
                  setStoreForm({ ...storeForm, name: e.target.value })
                }
                required
              />
            </label>
            <label>
              Contact phone
              <input
                value={storeForm.contactPhone}
                onChange={(e) =>
                  setStoreForm({ ...storeForm, contactPhone: e.target.value })
                }
              />
            </label>
            <label className="growth-check">
              <input
                type="checkbox"
                checked={storeForm.active}
                onChange={(e) =>
                  setStoreForm({ ...storeForm, active: e.target.checked })
                }
              />
              Accept direct orders
            </label>
            <button className="scorm-button-primary">
              <Save size={14} />
              Save storefront
            </button>
          </form>
          {url && (
            <div className="growth-link">
              <a href={url} target="_blank" rel="noreferrer">
                {url}
              </a>
              <code>{`<iframe src="${url}"></iframe>`}</code>
            </div>
          )}
        </section>
        <section className="growth-card">
          <header>
            <BadgePercent />
            <div>
              <span>Retention</span>
              <h3>Create offer</h3>
            </div>
          </header>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              act(
                () =>
                  api.post(
                    `/growth/tenants/${tenantId}/branches/${branchId}/offers`,
                    offer,
                    { headers: authHeaders(token) },
                  ),
                "Offer created.",
              );
              setOffer({ ...offer, code: "", name: "" });
            }}
          >
            <label>
              Code
              <input
                value={offer.code}
                onChange={(e) => setOffer({ ...offer, code: e.target.value })}
                required
              />
            </label>
            <label>
              Offer name
              <input
                value={offer.name}
                onChange={(e) => setOffer({ ...offer, name: e.target.value })}
                required
              />
            </label>
            <div className="growth-form-row">
              <label>
                Type
                <select
                  value={offer.discountType}
                  onChange={(e) =>
                    setOffer({ ...offer, discountType: e.target.value })
                  }
                >
                  <option>PERCENT</option>
                  <option>FIXED</option>
                </select>
              </label>
              <label>
                Value
                <input
                  type="number"
                  min="0"
                  value={offer.discountValue}
                  onChange={(e) =>
                    setOffer({ ...offer, discountValue: e.target.value })
                  }
                  required
                />
              </label>
            </div>
            <button className="scorm-button-primary">Create offer</button>
          </form>
          <div className="growth-mini-list">
            {data.offers.slice(0, 5).map((row) => (
              <div key={row.id}>
                <strong>{row.code}</strong>
                <span>
                  {row.name} ·{" "}
                  {row.discountType === "PERCENT"
                    ? `${row.discountValue}%`
                    : rupees(row.discountValue)}
                </span>
              </div>
            ))}
          </div>
        </section>
        <section className="growth-card wide">
          <header>
            <UsersRound />
            <div>
              <span>CRM</span>
              <h3>Consenting customers, loyalty & feedback</h3>
            </div>
          </header>
          <div className="growth-table">
            <div className="head">
              <span>Customer</span>
              <span>Visits</span>
              <span>Spend</span>
              <span>Loyalty</span>
            </div>
            {data.customers.slice(0, 12).map((row) => (
              <div key={row.id}>
                <span>
                  <strong>{row.name || "Guest"}</strong>
                  <small>
                    {row.phone} ·{" "}
                    {row.consentMarketing
                      ? "Marketing consent"
                      : "Transactional only"}
                  </small>
                </span>
                <span>{row.visitCount}</span>
                <span>{rupees(row.totalSpendMinor)}</span>
                <span>
                  {row.loyaltyPoints} pts · {rupees(row.walletMinor)}
                </span>
              </div>
            ))}
            {!data.customers.length && <p>No customer visits recorded yet.</p>}
          </div>
          <div className="feedback-strip">
            {data.feedback.slice(0, 4).map((row) => (
              <blockquote key={row.id}>
                <strong>{"★".repeat(row.rating)}</strong>
                <span>{row.comment || "Rating only"}</span>
              </blockquote>
            ))}
          </div>
        </section>
        <section className="growth-card">
          <header>
            <Link2 />
            <div>
              <span>Aggregators</span>
              <h3>Channel adapter</h3>
            </div>
          </header>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              act(
                () =>
                  api.post(
                    `/growth/tenants/${tenantId}/branches/${branchId}/connections`,
                    connection,
                    { headers: authHeaders(token) },
                  ),
                "Channel connected.",
              );
            }}
          >
            <div className="growth-form-row">
              <label>
                Provider
                <select
                  value={connection.provider}
                  onChange={(e) =>
                    setConnection({
                      provider: e.target.value,
                      displayName:
                        e.target.value[0] +
                        e.target.value.slice(1).toLowerCase(),
                    })
                  }
                >
                  <option>ZOMATO</option>
                  <option>SWIGGY</option>
                  <option>OTHER</option>
                </select>
              </label>
              <label>
                Display name
                <input
                  value={connection.displayName}
                  onChange={(e) =>
                    setConnection({
                      ...connection,
                      displayName: e.target.value,
                    })
                  }
                />
              </label>
            </div>
            <button className="scorm-button-primary">Connect</button>
          </form>
          <div className="growth-mini-list">
            {data.connections.map((row) => (
              <div key={row.id}>
                <span>
                  <strong>{row.displayName}</strong>
                  <small>
                    {row.status} ·{" "}
                    {row.lastMenuSyncAt ? "Menu synced" : "Never synced"}
                  </small>
                </span>
                <button
                  onClick={() =>
                    act(
                      () =>
                        api.post(
                          `/growth/tenants/${tenantId}/branches/${branchId}/connections/${row.id}/sync-menu`,
                          {},
                          { headers: authHeaders(token) },
                        ),
                      "Menu sync queued.",
                    )
                  }
                >
                  Sync menu
                </button>
              </div>
            ))}
          </div>
        </section>
        <section className="growth-card">
          <header>
            <Calculator />
            <div>
              <span>Finance</span>
              <h3>Payout reconciliation</h3>
            </div>
          </header>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              act(
                () =>
                  api.post(
                    `/growth/tenants/${tenantId}/branches/${branchId}/payouts`,
                    payout,
                    { headers: authHeaders(token) },
                  ),
                "Payout reconciled.",
              );
              setPayout({
                ...payout,
                settlementReference: "",
                grossMinor: "",
                netMinor: "",
              });
            }}
          >
            <div className="growth-form-row">
              <label>
                Provider
                <select
                  value={payout.provider}
                  onChange={(e) =>
                    setPayout({ ...payout, provider: e.target.value })
                  }
                >
                  <option>ZOMATO</option>
                  <option>SWIGGY</option>
                  <option>OTHER</option>
                </select>
              </label>
              <label>
                Settlement reference
                <input
                  value={payout.settlementReference}
                  onChange={(e) =>
                    setPayout({
                      ...payout,
                      settlementReference: e.target.value,
                    })
                  }
                  required
                />
              </label>
            </div>
            <div className="growth-form-row thirds">
              <label>
                Gross (paise)
                <input
                  type="number"
                  min="0"
                  value={payout.grossMinor}
                  onChange={(e) =>
                    setPayout({ ...payout, grossMinor: e.target.value })
                  }
                  required
                />
              </label>
              <label>
                Fees
                <input
                  type="number"
                  min="0"
                  value={payout.feesMinor}
                  onChange={(e) =>
                    setPayout({ ...payout, feesMinor: e.target.value })
                  }
                />
              </label>
              <label>
                Net paid
                <input
                  type="number"
                  min="0"
                  value={payout.netMinor}
                  onChange={(e) =>
                    setPayout({ ...payout, netMinor: e.target.value })
                  }
                  required
                />
              </label>
            </div>
            <button className="scorm-button-primary">Reconcile payout</button>
          </form>
          <div className="growth-mini-list">
            {data.payouts.slice(0, 5).map((row) => (
              <div key={row.id}>
                <span>
                  <strong>
                    {row.provider} · {row.settlementReference}
                  </strong>
                  <small>
                    {rupees(row.netMinor)} · variance{" "}
                    {rupees(row.varianceMinor)}
                  </small>
                </span>
                <em className={row.status === "MATCHED" ? "ok" : "warn"}>
                  {row.status}
                </em>
              </div>
            ))}
          </div>
        </section>
        <section className="growth-card wide">
          <header>
            <Calculator />
            <div>
              <span>Accounting</span>
              <h3>Tally-ready sales export & retry log</h3>
            </div>
          </header>
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              act(
                () =>
                  api.post(
                    `/growth/tenants/${tenantId}/branches/${branchId}/accounting-exports`,
                    exportForm,
                    { headers: authHeaders(token) },
                  ),
                "Accounting export generated.",
              );
            }}
          >
            <label>
              Format
              <select
                value={exportForm.format}
                onChange={(e) =>
                  setExportForm({ ...exportForm, format: e.target.value })
                }
              >
                <option>TALLY_CSV</option>
                <option>JSON</option>
              </select>
            </label>
            <label>
              From
              <input
                type="date"
                value={exportForm.periodStart}
                onChange={(e) =>
                  setExportForm({ ...exportForm, periodStart: e.target.value })
                }
              />
            </label>
            <label>
              To
              <input
                type="date"
                value={exportForm.periodEnd}
                onChange={(e) =>
                  setExportForm({ ...exportForm, periodEnd: e.target.value })
                }
              />
            </label>
            <button className="scorm-button-primary">Generate</button>
          </form>
          <div className="growth-mini-list">
            {data.exports.slice(0, 6).map((row) => (
              <div key={row.id}>
                <span>
                  <strong>
                    {row.format} · {row.periodStart} to {row.periodEnd}
                  </strong>
                  <small>
                    {row.rowCount} rows · {row.status}
                    {row.error ? ` · ${row.error}` : ""}
                  </small>
                </span>
                {row.status === "FAILED" && (
                  <button
                    onClick={() =>
                      act(
                        () =>
                          api.post(
                            `/growth/tenants/${tenantId}/branches/${branchId}/accounting-exports/${row.id}/retry`,
                            {},
                            { headers: authHeaders(token) },
                          ),
                        "Export retried.",
                      )
                    }
                  >
                    Retry
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
