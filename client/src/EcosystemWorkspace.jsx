import React, { useEffect, useMemo, useState } from "react";
import { Activity, KeyRound, RefreshCw, Store, Webhook } from "lucide-react";
import { api, apiErrorMessage, authHeaders } from "./api";
import "./ecosystem.css";
export default function EcosystemWorkspace({ token, access }) {
  const admin = (access?.tenants || []).find(
    (row) => row.role === "TENANT_ADMIN",
  );
  const assigned = useMemo(
    () =>
      (access?.branches || []).filter((row) => row.role === "BRANCH_MANAGER"),
    [access],
  );
  const [branches, setBranches] = useState(
      assigned
        .map((row) => ({ ...row.branch, tenantId: row.tenantId }))
        .filter(Boolean),
    ),
    [branchId, setBranchId] = useState(assigned[0]?.branchId || "");
  const branch = branches.find((row) => row.id === branchId),
    tenantId =
      branch?.tenantId || admin?.tenantId || assigned[0]?.tenantId || "";
  const [data, setData] = useState({
      keys: [],
      subscriptions: [],
      deliveries: [],
    }),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(false),
    [keyName, setKeyName] = useState("Partner sandbox"),
    [webhookUrl, setWebhookUrl] = useState(""),
    [revealed, setRevealed] = useState(null);
  useEffect(() => {
    if (!admin) return;
    api
      .get(`/tenants/${admin.tenantId}/branches`, {
        headers: authHeaders(token),
      })
      .then(({ data: result }) => {
        const rows = (result.branches || []).map((row) => ({
          ...row,
          tenantId: admin.tenantId,
        }));
        setBranches(rows);
        setBranchId((current) =>
          rows.some((row) => row.id === current) ? current : rows[0]?.id || "",
        );
      });
  }, [admin?.tenantId, token]);
  async function load() {
    if (!tenantId || !branchId) return;
    try {
      setLoading(true);
      setError("");
      const result = await api.get(
        `/ecosystem/tenants/${tenantId}/branches/${branchId}`,
        { headers: authHeaders(token) },
      );
      setData(result.data);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, [tenantId, branchId, token]);
  async function act(fn, message) {
    try {
      setLoading(true);
      setError("");
      const result = await fn();
      if (result.data?.secret)
        setRevealed({
          secret: result.data.secret,
          warning: result.data.warning,
        });
      setNotice(message);
      await load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }
  const base = `/ecosystem/tenants/${tenantId}/branches/${branchId}`;
  return (
    <div className="eco-page">
      <section className="eco-hero">
        <div>
          <span>Reliability & ecosystem</span>
          <h2>Devices, API keys and webhooks</h2>
          <p>
            Connect trusted partners with scoped credentials and monitor every
            outbound delivery.
          </p>
        </div>
        <button
          className="scorm-button-secondary eco-refresh"
          onClick={load}
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? "spin" : ""} />
          Refresh
        </button>
      </section>
      <div className="eco-scope">
        <Store size={16} />
        <label>
          Branch
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
      </div>
      {error && <div className="eco-alert error">{error}</div>}
      {notice && <div className="eco-alert success">{notice}</div>}
      {revealed && (
        <div className="eco-secret">
          <strong>Copy now — shown once</strong>
          <code>{revealed.secret}</code>
          <button
            onClick={() => navigator.clipboard?.writeText(revealed.secret)}
          >
            Copy
          </button>
        </div>
      )}
      <div className="eco-grid">
        <section className="eco-card">
          <header>
            <KeyRound />
            <div>
              <span>Partner access</span>
              <h3>Scoped API keys</h3>
            </div>
          </header>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              act(
                () =>
                  api.post(
                    `${base}/keys`,
                    {
                      name: keyName,
                      sandbox: true,
                      scopes: ["catalogue:read", "orders:write"],
                    },
                    { headers: authHeaders(token) },
                  ),
                "Sandbox key created.",
              );
            }}
          >
            <label>
              Name
              <input
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                required
              />
            </label>
            <button className="scorm-button-primary">Create sandbox key</button>
          </form>
          <div className="eco-list">
            {data.keys.map((row) => (
              <article key={row.id}>
                <span>
                  <strong>{row.name}</strong>
                  <small>
                    {row.keyPrefix}… · {row.status} ·{" "}
                    {row.sandbox ? "SANDBOX" : "LIVE"}
                  </small>
                </span>
                {row.status === "ACTIVE" && (
                  <button
                    onClick={() =>
                      act(
                        () =>
                          api.delete(`${base}/keys/${row.id}`, {
                            headers: authHeaders(token),
                          }),
                        "Key revoked.",
                      )
                    }
                  >
                    Revoke
                  </button>
                )}
              </article>
            ))}
          </div>
        </section>
        <section className="eco-card">
          <header>
            <Webhook />
            <div>
              <span>Event delivery</span>
              <h3>Signed webhooks</h3>
            </div>
          </header>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              act(
                () =>
                  api.post(
                    `${base}/webhooks`,
                    {
                      url: webhookUrl,
                      events: ["order.created", "order.paid"],
                    },
                    { headers: authHeaders(token) },
                  ),
                "Webhook registered.",
              );
              setWebhookUrl("");
            }}
          >
            <label>
              HTTPS endpoint
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://partner.example/webhooks"
                required
              />
            </label>
            <button className="scorm-button-primary">Add webhook</button>
          </form>
          <div className="eco-list">
            {data.subscriptions.map((row) => (
              <article key={row.id}>
                <span>
                  <strong>{row.url}</strong>
                  <small>
                    {(row.events || []).join(", ")} · {row.status}
                  </small>
                </span>
                <button
                  onClick={() =>
                    act(
                      () =>
                        api.post(
                          `${base}/webhooks/${row.id}/test`,
                          {},
                          { headers: authHeaders(token) },
                        ),
                      "Test delivery queued.",
                    )
                  }
                >
                  Test
                </button>
              </article>
            ))}
          </div>
        </section>
        <section className="eco-card wide">
          <header>
            <Activity />
            <div>
              <span>Health log</span>
              <h3>Webhook delivery attempts</h3>
            </div>
          </header>
          <div className="eco-table">
            <div className="head">
              <span>Event</span>
              <span>Status</span>
              <span>Attempts</span>
              <span>Last error</span>
            </div>
            {data.deliveries.map((row) => (
              <div className="eco-delivery-row" key={row.id}>
                <span data-label="Event">{row.eventType}</span>
                <strong
                  data-label="Status"
                  className={`status-${row.status.toLowerCase()}`}
                >
                  {row.status}
                </strong>
                <span data-label="Attempts">{row.attempts}</span>
                <span data-label="Last error">{row.lastError || "—"}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
