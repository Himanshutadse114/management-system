import React, { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  CreditCard,
  FileText,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Store,
} from "lucide-react";
import { api, apiErrorMessage, authHeaders } from "./api";
import "./settings.css";

const EMPTY = {
  legalName: "",
  gstin: "",
  fssaiNumber: "",
  stateCode: "",
  invoicePrefix: "INV",
  receiptFooter: "Thank you for visiting.",
  defaultTaxRateBps: 0,
  serviceChargeRateBps: 0,
  allowedPaymentMethods: ["CASH", "CARD", "UPI"],
  upiVpa: "",
  opensAt: "",
  closesAt: "",
  businessDayCloseAt: "04:00",
  requireShiftForBilling: true,
};

export default function SettingsWorkspace({ token, access }) {
  const tenantAdmin = (access?.tenants || []).find(
    (row) => row.role === "TENANT_ADMIN",
  );
  const managerAssignments = useMemo(
    () =>
      (access?.branches || []).filter((row) => row.role === "BRANCH_MANAGER"),
    [access],
  );
  const [tenantId, setTenantId] = useState(
    tenantAdmin?.tenantId || managerAssignments[0]?.tenantId || "",
  );
  const [branches, setBranches] = useState(
    managerAssignments.map((row) => row.branch).filter(Boolean),
  );
  const [branchId, setBranchId] = useState(
    managerAssignments[0]?.branchId || "",
  );
  const [reloadKey, setReloadKey] = useState(0);
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [devices, setDevices] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [deviceForm, setDeviceForm] = useState({
    name: "",
    deviceType: "RECEIPT_PRINTER",
    connectionType: "BROWSER",
    endpoint: "",
    station: "",
  });

  useEffect(() => {
    if (!tenantAdmin) return;
    api
      .get(`/tenants/${tenantAdmin.tenantId}/branches`, {
        headers: authHeaders(token),
      })
      .then(({ data }) => {
        const rows = data.branches || [];
        setBranches(rows);
        setBranchId((current) =>
          rows.some((row) => row.id === current) ? current : rows[0]?.id || "",
        );
      })
      .catch((err) => setError(apiErrorMessage(err)));
  }, [tenantAdmin?.tenantId, token]);
  useEffect(() => {
    if (!tenantId || !branchId) return;
    setLoading(true);
    setError("");
    const headers = authHeaders(token);
    Promise.all([
      api.get(`/settings/tenants/${tenantId}/branches/${branchId}`, {
        headers,
      }),
      api.get(`/devices/tenants/${tenantId}/branches/${branchId}`, { headers }),
    ])
      .then(([settingsResult, deviceResult]) => {
        setForm({
          ...EMPTY,
          ...settingsResult.data.settings,
          opensAt: settingsResult.data.settings?.opensAt || "",
          closesAt: settingsResult.data.settings?.closesAt || "",
        });
        setDevices(deviceResult.data.devices || []);
        setJobs(deviceResult.data.jobs || []);
      })
      .catch((err) => setError(apiErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [tenantId, branchId, token, reloadKey]);

  function togglePayment(method) {
    setForm((current) => ({
      ...current,
      allowedPaymentMethods: current.allowedPaymentMethods.includes(method)
        ? current.allowedPaymentMethods.filter((value) => value !== method)
        : [...current.allowedPaymentMethods, method],
    }));
  }
  async function save(event) {
    event.preventDefault();
    try {
      setLoading(true);
      setError("");
      await api.patch(
        `/settings/tenants/${tenantId}/branches/${branchId}`,
        {
          ...form,
          defaultTaxRateBps: Number(form.defaultTaxRateBps),
          serviceChargeRateBps: Number(form.serviceChargeRateBps),
        },
        { headers: authHeaders(token) },
      );
      setNotice("Branch settings saved.");
      window.setTimeout(() => setNotice(""), 2400);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }
  async function addDevice(event) {
    event.preventDefault();
    try {
      setLoading(true);
      setError("");
      await api.post(
        `/devices/tenants/${tenantId}/branches/${branchId}`,
        deviceForm,
        { headers: authHeaders(token) },
      );
      setDeviceForm({
        name: "",
        deviceType: "RECEIPT_PRINTER",
        connectionType: "BROWSER",
        endpoint: "",
        station: "",
      });
      setReloadKey((value) => value + 1);
      setNotice("Device registered.");
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }
  async function testPrint(device) {
    try {
      setLoading(true);
      setError("");
      await api.post(
        `/devices/tenants/${tenantId}/branches/${branchId}/${device.id}/test-print`,
        { idempotencyKey: crypto.randomUUID() },
        { headers: authHeaders(token) },
      );
      setReloadKey((value) => value + 1);
      setNotice("Test print queued.");
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }
  async function heartbeatDevice(device) {
    try { setLoading(true); setError(""); await api.post(`/devices/tenants/${tenantId}/branches/${branchId}/${device.id}/heartbeat`, { capabilities:{ browser:navigator.userAgent.slice(0,120) } }, { headers:authHeaders(token) }); setReloadKey((value)=>value+1); setNotice("Device heartbeat recorded."); }
    catch(err){setError(apiErrorMessage(err));} finally{setLoading(false);}
  }
  const activeBranch = branches.find((row) => row.id === branchId);

  return (
    <div className="settings-page">
      <section className="settings-hero">
        <div>
          <span>Business controls</span>
          <h2>Branch settings</h2>
          <p>
            Keep tax identity, bill details, payment methods and operating times
            in one controlled place.
          </p>
        </div>
        <button
          className="scorm-button-secondary"
          onClick={() => setReloadKey((value) => value + 1)}
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? "spin" : ""} />
          Refresh
        </button>
      </section>
      <div className="settings-scope">
        <Store size={16} />
        <label>
          <span>Branch</span>
          <select
            value={branchId}
            onChange={(event) => {
              const id = event.target.value;
              setBranchId(id);
              const row = branches.find((branch) => branch.id === id);
              if (row)
                setTenantId(row.tenantId || tenantAdmin?.tenantId || tenantId);
            }}
          >
            {branches.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name} · {row.code}
              </option>
            ))}
          </select>
        </label>
        <div>
          <strong>
            {activeBranch?.type === "BAR_RESTAURANT"
              ? "Bar + Restaurant"
              : "Wine Shop"}
          </strong>
          <span>
            {activeBranch?.timezone || "Asia/Kolkata"} ·{" "}
            {activeBranch?.currency || "INR"}
          </span>
        </div>
      </div>
      {error && <div className="settings-message error">{error}</div>}
      {notice && (
        <div className="settings-message success">
          <CheckCircle2 size={14} />
          {notice}
        </div>
      )}
      <form className="settings-form" onSubmit={save}>
        <section className="settings-card">
          <header>
            <FileText size={17} />
            <div>
              <span>Invoice identity</span>
              <h3>Legal & receipt details</h3>
            </div>
          </header>
          <div className="settings-grid two">
            <label>
              <span>Legal business name</span>
              <input
                value={form.legalName || ""}
                onChange={(event) =>
                  setForm({ ...form, legalName: event.target.value })
                }
                placeholder="Registered legal name"
              />
            </label>
            <label>
              <span>Invoice prefix</span>
              <input
                value={form.invoicePrefix || ""}
                onChange={(event) =>
                  setForm({ ...form, invoicePrefix: event.target.value })
                }
                required
              />
            </label>
            <label>
              <span>GSTIN</span>
              <input
                value={form.gstin || ""}
                onChange={(event) =>
                  setForm({ ...form, gstin: event.target.value.toUpperCase() })
                }
                maxLength="15"
                placeholder="15-character GSTIN"
              />
            </label>
            <label>
              <span>State code</span>
              <input
                value={form.stateCode || ""}
                onChange={(event) =>
                  setForm({ ...form, stateCode: event.target.value })
                }
                maxLength="2"
                placeholder="27"
              />
            </label>
            <label>
              <span>FSSAI number</span>
              <input
                value={form.fssaiNumber || ""}
                onChange={(event) =>
                  setForm({ ...form, fssaiNumber: event.target.value })
                }
              />
            </label>
          </div>
          <label>
            <span>Receipt footer</span>
            <textarea
              rows="3"
              value={form.receiptFooter || ""}
              onChange={(event) =>
                setForm({ ...form, receiptFooter: event.target.value })
              }
            />
          </label>
        </section>
        <section className="settings-card">
          <header>
            <CreditCard size={17} />
            <div>
              <span>Billing policy</span>
              <h3>Tax, service charge & payments</h3>
            </div>
          </header>
          <div className="settings-grid two">
            <label>
              <span>Default tax rate (basis points)</span>
              <input
                type="number"
                min="0"
                max="10000"
                value={form.defaultTaxRateBps}
                onChange={(event) =>
                  setForm({ ...form, defaultTaxRateBps: event.target.value })
                }
              />
              <small>1800 = 18%</small>
            </label>
            <label>
              <span>Service charge (basis points)</span>
              <input
                type="number"
                min="0"
                max="10000"
                value={form.serviceChargeRateBps}
                onChange={(event) =>
                  setForm({ ...form, serviceChargeRateBps: event.target.value })
                }
              />
              <small>1000 = 10%</small>
            </label>
          </div>
          <fieldset>
            <legend>Accepted payment methods</legend>
            <div className="payment-toggle">
              {["CASH", "CARD", "UPI", "OTHER"].map((method) => (
                <label key={method}>
                  <input
                    type="checkbox"
                    checked={form.allowedPaymentMethods.includes(method)}
                    onChange={() => togglePayment(method)}
                  />
                  <span>{method}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label>
            <span>UPI ID for guest QR payments</span>
            <input value={form.upiVpa || ""} onChange={(event) => setForm({ ...form, upiVpa: event.target.value })} placeholder="outlet@bank" />
            <small>Guests can open their UPI app, then enter the transaction reference for manager verification.</small>
          </label>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={form.requireShiftForBilling}
              onChange={(event) =>
                setForm({
                  ...form,
                  requireShiftForBilling: event.target.checked,
                })
              }
            />
            <span>
              <strong>Require an open cashier shift</strong>
              <small>Recommended for accountable cash and handovers.</small>
            </span>
          </label>
        </section>
        <section className="settings-card">
          <header>
            <Clock3 size={17} />
            <div>
              <span>Operating day</span>
              <h3>Opening, closing & day cut-off</h3>
            </div>
          </header>
          <div className="settings-grid three">
            <label>
              <span>Opens at</span>
              <input
                type="time"
                value={form.opensAt || ""}
                onChange={(event) =>
                  setForm({ ...form, opensAt: event.target.value })
                }
              />
            </label>
            <label>
              <span>Closes at</span>
              <input
                type="time"
                value={form.closesAt || ""}
                onChange={(event) =>
                  setForm({ ...form, closesAt: event.target.value })
                }
              />
            </label>
            <label>
              <span>Business day closes at</span>
              <input
                type="time"
                value={form.businessDayCloseAt || "04:00"}
                onChange={(event) =>
                  setForm({ ...form, businessDayCloseAt: event.target.value })
                }
                required
              />
            </label>
          </div>
        </section>
        <button
          className="scorm-button-primary settings-save"
          disabled={loading || !branchId}
        >
          <Save size={15} />
          {loading ? "Saving…" : "Save branch settings"}
        </button>
      </form>
      <section className="settings-devices">
        <div className="settings-card">
          <header>
            <Printer size={17} />
            <div>
              <span>Hardware</span>
              <h3>Register printer or terminal</h3>
            </div>
          </header>
          <form onSubmit={addDevice} className="device-form">
            <label>
              <span>Device name</span>
              <input
                value={deviceForm.name}
                onChange={(event) =>
                  setDeviceForm({ ...deviceForm, name: event.target.value })
                }
                required
                placeholder="Bar receipt printer"
              />
            </label>
            <div className="settings-grid two">
              <label>
                <span>Device type</span>
                <select
                  value={deviceForm.deviceType}
                  onChange={(event) =>
                    setDeviceForm({
                      ...deviceForm,
                      deviceType: event.target.value,
                    })
                  }
                >
                  <option>RECEIPT_PRINTER</option>
                  <option>KOT_PRINTER</option>
                  <option>KDS</option>
                  <option>TERMINAL</option>
                  <option>CUSTOMER_DISPLAY</option>
                  <option>TOKEN_DISPLAY</option>
                  <option>CALLING_DEVICE</option>
                  <option>KIOSK</option>
                </select>
              </label>
              <label>
                <span>Connection</span>
                <select
                  value={deviceForm.connectionType}
                  onChange={(event) =>
                    setDeviceForm({
                      ...deviceForm,
                      connectionType: event.target.value,
                    })
                  }
                >
                  <option>BROWSER</option>
                  <option>USB</option>
                  <option>TCP</option>
                  <option>NETWORK</option>
                  <option>APP</option>
                </select>
              </label>
            </div>
            <label>
              <span>Station (optional)</span>
              <input
                value={deviceForm.station}
                onChange={(event) =>
                  setDeviceForm({ ...deviceForm, station: event.target.value })
                }
                placeholder="Bar, kitchen, billing counter"
              />
            </label>
            <label>
              <span>Endpoint / queue (optional)</span>
              <input
                value={deviceForm.endpoint}
                onChange={(event) =>
                  setDeviceForm({ ...deviceForm, endpoint: event.target.value })
                }
                placeholder="Network address or local queue"
              />
            </label>
            <button className="scorm-button-primary">
              <Plus size={14} />
              Register device
            </button>
          </form>
        </div>
        <div className="settings-card">
          <header>
            <Printer size={17} />
            <div>
              <span>Devices & queue</span>
              <h3>{devices.length} registered</h3>
            </div>
          </header>
          <div className="device-list">
            {!devices.length && (
              <div className="device-empty">
                No printers or terminals registered.
              </div>
            )}
            {devices.map((device) => (
              <article key={device.id}>
                <div>
                  <span>
                    {device.deviceType.replaceAll("_", " ")} · {device.status}
                  </span>
                  <strong>{device.name}</strong>
                  <small>
                    {device.station || "No station"} · {device.connectionType} · {device.lastSeenAt ? `seen ${new Date(device.lastSeenAt).toLocaleString("en-IN")}` : "no heartbeat"}
                  </small>
                </div>
                {device.deviceType.includes("PRINTER") ? <button type="button" onClick={() => testPrint(device)} disabled={loading || device.status !== "ACTIVE"}>Test print</button> : <button type="button" onClick={() => heartbeatDevice(device)} disabled={loading}>Check in</button>}
              </article>
            ))}
          </div>
          <div className="print-queue">
            <strong>Recent print queue</strong>
            {jobs.slice(0, 5).map((job) => (
              <div key={job.id}>
                <span>
                  {job.device?.name || "Device"} ·{" "}
                  {job.jobType.replaceAll("_", " ")}
                </span>
                <em className={`job-${job.status.toLowerCase()}`}>
                  {job.status}
                </em>
              </div>
            ))}
            {!jobs.length && <span>No jobs queued.</span>}
          </div>
        </div>
      </section>
    </div>
  );
}
