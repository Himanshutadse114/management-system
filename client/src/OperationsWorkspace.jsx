import React, { useEffect, useMemo, useState } from "react";
import {
  ClipboardCheck,
  Factory,
  FileCheck2,
  ShoppingCart,
  Store,
  UsersRound,
  WandSparkles,
} from "lucide-react";
import { api, apiErrorMessage, authHeaders } from "./api";
import { downloadBlob } from "./download";
import RefreshButton from "./RefreshButton";
import "./operations.css";
const blank = {
  procurement: [],
  vendorMetrics: [],
  tasks: [],
  employees: [],
  workforce: [],
  templates: [],
  dispatches: [],
  automations: [],
  suppliers: [],
};
const today = () => new Date().toISOString().slice(0, 10);
export default function OperationsWorkspace({ token, access }) {
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
  );
  const [branchId, setBranchId] = useState(assigned[0]?.branchId || "");
  const branch = branches.find((row) => row.id === branchId),
    tenantId =
      branch?.tenantId || admin?.tenantId || assigned[0]?.tenantId || "";
  const [data, setData] = useState(blank),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [proc, setProc] = useState({
    documentType: "REQUISITION",
    documentNumber: "",
    vendorId: "",
    amountMinor: "0",
  });
  const [task, setTask] = useState({
    title: "",
    priority: "NORMAL",
    recurrence: "",
    dueAt: "",
  });
  const [vendor, setVendor] = useState({ vendorId:"", quotedPriceMinor:"", onTimeRateBps:"10000", qualityScore:"100", leadTimeDays:"0", notes:"" });
  const [dispatch, setDispatch] = useState({ destinationBranchId:"", templateId:"", payload:{ note:"Central kitchen dispatch" } });
  const [employee, setEmployee] = useState({
    employeeCode: "",
    name: "",
    jobTitle: "",
    phone: "",
    payRateMinor: "0",
    joinedOn: today(),
  });
  const [event, setEvent] = useState({
    employeeId: "",
    eventType: "ROSTER",
    startsAt: "",
    endsAt: "",
    amountMinor: "0",
  });
  const [template, setTemplate] = useState({
    name: "",
    templateType: "MENU",
    publish: true,
    payload: {},
  });
  const [automation, setAutomation] = useState({
    name: "Daily sales watch",
    reportType: "SALES_FORECAST",
    schedule: "DAILY 08:00",
    alertRules: { varianceBps: 3000 },
  });
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
      })
      .catch((err) => setError(apiErrorMessage(err)));
  }, [admin?.tenantId, token]);
  async function load() {
    if (!tenantId || !branchId) return;
    try {
      setLoading(true);
      setError("");
      const result = await api.get(
        `/operations/tenants/${tenantId}/branches/${branchId}/overview`,
        { headers: authHeaders(token) },
      );
      setData({ ...blank, ...result.data });
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
      setTimeout(() => setNotice(""), 2200);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }
  async function downloadWorkforce(){try{const response=await api.get(`${endpoint}/workforce-export.csv`,{headers:authHeaders(token),responseType:"blob"});await downloadBlob(response.data,`workforce-${branch?.code||branchId}.csv`);}catch(err){setError(apiErrorMessage(err));}}
  const endpoint = `/operations/tenants/${tenantId}/branches/${branchId}`;
  return (
    <div className="control-page">
      <section className="control-hero">
        <div>
          <span>Owner control</span>
          <h2>Procurement, people & operating standards</h2>
          <p>
            Approve buying, measure vendors, run SOPs, manage teams, and
            standardize every outlet.
          </p>
        </div>
        <RefreshButton onRefresh={load} busy={loading} />
      </section>
      <div className="control-scope">
        <Store size={16} />
        <label>
          Branch
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
          >
            {branches.map((row) => (
              <option value={row.id} key={row.id}>
                {row.name} · {row.code}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && <div className="control-alert error">{error}</div>}
      {notice && <div className="control-alert success">{notice}</div>}
      <div className="control-metrics">
        <article>
          <ShoppingCart />
          <strong>
            {
              data.procurement.filter(
                (row) => row.status === "PENDING_APPROVAL",
              ).length
            }
          </strong>
          <span>Approvals waiting</span>
        </article>
        <article>
          <ClipboardCheck />
          <strong>
            {
              data.tasks.filter(
                (row) => !["APPROVED", "COMPLETED"].includes(row.status),
              ).length
            }
          </strong>
          <span>Open SOP tasks</span>
        </article>
        <article>
          <UsersRound />
          <strong>
            {data.employees.filter((row) => row.status === "ACTIVE").length}
          </strong>
          <span>Active employees</span>
        </article>
        <article>
          <WandSparkles />
          <strong>
            {data.automations.filter((row) => row.lastResult?.anomaly).length}
          </strong>
          <span>Detected anomalies</span>
        </article>
      </div>
      <div className="control-grid">
        <section className="control-card">
          <header>
            <ShoppingCart />
            <div>
              <span>Procure-to-pay</span>
              <h3>New document</h3>
            </div>
          </header>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              act(
                () =>
                  api.post(`${endpoint}/procurement`, proc, {
                    headers: authHeaders(token),
                  }),
                "Procurement document created.",
              );
              setProc({ ...proc, documentNumber: "", amountMinor: "0" });
            }}
          >
            <div className="control-row">
              <label>
                Stage
                <select
                  value={proc.documentType}
                  onChange={(e) =>
                    setProc({ ...proc, documentType: e.target.value })
                  }
                >
                  {[
                    "REQUISITION",
                    "PURCHASE_ORDER",
                    "GRN",
                    "VENDOR_INVOICE",
                    "DEBIT_NOTE",
                    "PAYABLE",
                  ].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <label>
                Number
                <input
                  value={proc.documentNumber}
                  onChange={(e) =>
                    setProc({ ...proc, documentNumber: e.target.value })
                  }
                  required
                />
              </label>
            </div>
            <label>
              Vendor
              <select
                value={proc.vendorId}
                onChange={(e) => setProc({ ...proc, vendorId: e.target.value })}
              >
                <option value="">Not selected</option>
                {data.suppliers.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Amount (paise)
              <input
                type="number"
                value={proc.amountMinor}
                onChange={(e) =>
                  setProc({ ...proc, amountMinor: e.target.value })
                }
              />
            </label>
            <button className="scorm-button-primary">Create document</button>
          </form>
          <div className="control-list">
            {data.procurement.slice(0, 6).map((row) => (
              <article key={row.id}>
                <span>
                  <strong>
                    {row.documentType.replaceAll("_", " ")} ·{" "}
                    {row.documentNumber}
                  </strong>
                  <small>
                    {row.status} · ₹
                    {(Number(row.amountMinor) / 100).toLocaleString("en-IN")}
                  </small>
                </span>
                {row.status === "PENDING_APPROVAL" && (
                  <button
                    onClick={() =>
                      act(
                        () =>
                          api.post(
                            `${endpoint}/procurement/${row.id}/transition`,
                            { status: "APPROVED" },
                            { headers: authHeaders(token) },
                          ),
                        "Approved.",
                      )
                    }
                  >
                    Approve
                  </button>
                )}
              </article>
            ))}
          </div>
        </section>
        <section className="control-card">
          <header><ShoppingCart/><div><span>Vendor intelligence</span><h3>Compare price & performance</h3></div></header>
          <form onSubmit={(e)=>{e.preventDefault();act(()=>api.post(`${endpoint}/vendor-metrics`,vendor,{headers:authHeaders(token)}),"Vendor performance recorded.");}}>
            <label>Vendor<select value={vendor.vendorId} onChange={(e)=>setVendor({...vendor,vendorId:e.target.value})} required><option value="">Choose vendor</option>{data.suppliers.map((row)=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
            <div className="control-row"><label>Quoted price (paise)<input type="number" min="0" value={vendor.quotedPriceMinor} onChange={(e)=>setVendor({...vendor,quotedPriceMinor:e.target.value})}/></label><label>Lead time days<input type="number" min="0" value={vendor.leadTimeDays} onChange={(e)=>setVendor({...vendor,leadTimeDays:e.target.value})}/></label></div>
            <div className="control-row"><label>On-time rate (bps)<input type="number" min="0" max="10000" value={vendor.onTimeRateBps} onChange={(e)=>setVendor({...vendor,onTimeRateBps:e.target.value})}/></label><label>Quality / 100<input type="number" min="0" max="100" value={vendor.qualityScore} onChange={(e)=>setVendor({...vendor,qualityScore:e.target.value})}/></label></div>
            <button className="scorm-button-primary">Save vendor score</button>
          </form>
          <div className="control-list">{data.vendorMetrics.slice(0,6).map((row)=><article key={row.id}><span><strong>{data.suppliers.find((vendorRow)=>vendorRow.id===row.vendorId)?.name||"Vendor"}</strong><small>₹{(Number(row.quotedPriceMinor||0)/100).toLocaleString("en-IN")} · quality {row.qualityScore}/100 · {row.leadTimeDays} days</small></span></article>)}</div>
        </section>
        <section className="control-card">
          <header>
            <ClipboardCheck />
            <div>
              <span>Tasks & SOP</span>
              <h3>Assign, prove, approve</h3>
            </div>
          </header>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              act(
                () =>
                  api.post(`${endpoint}/tasks`, task, {
                    headers: authHeaders(token),
                  }),
                "Task created.",
              );
              setTask({ ...task, title: "" });
            }}
          >
            <label>
              Task title
              <input
                value={task.title}
                onChange={(e) => setTask({ ...task, title: e.target.value })}
                required
              />
            </label>
            <div className="control-row">
              <label>
                Priority
                <select
                  value={task.priority}
                  onChange={(e) =>
                    setTask({ ...task, priority: e.target.value })
                  }
                >
                  <option>NORMAL</option>
                  <option>HIGH</option>
                  <option>CRITICAL</option>
                </select>
              </label>
              <label>
                Recurrence
                <input
                  value={task.recurrence}
                  onChange={(e) =>
                    setTask({ ...task, recurrence: e.target.value })
                  }
                  placeholder="DAILY / WEEKLY"
                />
              </label>
            </div>
            <label>
              Due
              <input
                type="datetime-local"
                value={task.dueAt}
                onChange={(e) => setTask({ ...task, dueAt: e.target.value })}
              />
            </label>
            <button className="scorm-button-primary">Assign task</button>
          </form>
          <div className="control-list">
            {data.tasks.slice(0, 7).map((row) => (
              <article key={row.id}>
                <span>
                  <strong>{row.title}</strong>
                  <small>
                    {row.priority} · {row.status}
                    {row.recurrence ? ` · ${row.recurrence}` : ""}
                  </small>
                </span>
                {row.status === "OPEN" && (
                  <button
                    onClick={() =>
                      act(
                        () =>
                          api.post(
                            `${endpoint}/tasks/${row.id}/transition`,
                            {
                              status: "COMPLETED",
                              evidence: { note: "Manager verified" },
                            },
                            { headers: authHeaders(token) },
                          ),
                        "Task completed.",
                      )
                    }
                  >
                    Complete
                  </button>
                )}
              </article>
            ))}
          </div>
        </section>
        <section className="control-card wide">
          <header>
            <UsersRound />
            <div>
              <span>Workforce</span>
              <h3>Employee, roster, attendance, leave & payroll inputs</h3>
            </div>
            <button className="scorm-button-secondary" type="button" onClick={downloadWorkforce}>Export CSV</button>
          </header>
          <div className="control-halves">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                act(
                  () =>
                    api.post(`${endpoint}/employees`, employee, {
                      headers: authHeaders(token),
                    }),
                  "Employee added.",
                );
                setEmployee({
                  ...employee,
                  employeeCode: "",
                  name: "",
                  phone: "",
                });
              }}
            >
              <div className="control-row">
                <label>
                  Employee code
                  <input
                    value={employee.employeeCode}
                    onChange={(e) =>
                      setEmployee({ ...employee, employeeCode: e.target.value })
                    }
                    required
                  />
                </label>
                <label>
                  Name
                  <input
                    value={employee.name}
                    onChange={(e) =>
                      setEmployee({ ...employee, name: e.target.value })
                    }
                    required
                  />
                </label>
              </div>
              <div className="control-row">
                <label>
                  Job title
                  <input
                    value={employee.jobTitle}
                    onChange={(e) =>
                      setEmployee({ ...employee, jobTitle: e.target.value })
                    }
                    required
                  />
                </label>
                <label>
                  Pay rate (paise)
                  <input
                    type="number"
                    value={employee.payRateMinor}
                    onChange={(e) =>
                      setEmployee({ ...employee, payRateMinor: e.target.value })
                    }
                  />
                </label>
              </div>
              <button className="scorm-button-primary">Add employee</button>
            </form>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                act(
                  () =>
                    api.post(`${endpoint}/workforce-events`, event, {
                      headers: authHeaders(token),
                    }),
                  "Workforce entry saved.",
                );
              }}
            >
              <div className="control-row">
                <label>
                  Employee
                  <select
                    value={event.employeeId}
                    onChange={(e) =>
                      setEvent({ ...event, employeeId: e.target.value })
                    }
                    required
                  >
                    <option value="">Choose</option>
                    {data.employees.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Entry
                  <select
                    value={event.eventType}
                    onChange={(e) =>
                      setEvent({ ...event, eventType: e.target.value })
                    }
                  >
                    {[
                      "ROSTER",
                      "ATTENDANCE",
                      "LEAVE",
                      "PAYROLL",
                      "ADVANCE",
                    ].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="control-row">
                <label>
                  Starts
                  <input
                    type="datetime-local"
                    value={event.startsAt}
                    onChange={(e) =>
                      setEvent({ ...event, startsAt: e.target.value })
                    }
                  />
                </label>
                <label>
                  Ends
                  <input
                    type="datetime-local"
                    value={event.endsAt}
                    onChange={(e) =>
                      setEvent({ ...event, endsAt: e.target.value })
                    }
                  />
                </label>
              </div>
              <button className="scorm-button-primary">
                Record workforce entry
              </button>
            </form>
          </div>
          <div className="control-table">
            <div className="head">
              <span>Employee</span>
              <span>Role</span>
              <span>Status</span>
              <span>Events</span>
            </div>
            {data.employees.map((row) => (
              <div key={row.id}>
                <span>
                  <strong>{row.name}</strong>
                  <small>{row.employeeCode}</small>
                </span>
                <span>{row.jobTitle}</span>
                <span>{row.status}</span>
                <span>
                  {
                    data.workforce.filter(
                      (entry) => entry.employeeId === row.id,
                    ).length
                  }
                </span>
              </div>
            ))}
          </div>
        </section>
        <section className="control-card">
          <header>
            <Factory />
            <div>
              <span>Group control</span>
              <h3>Central templates</h3>
            </div>
          </header>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              act(
                () =>
                  api.post(`${endpoint}/templates`, template, {
                    headers: authHeaders(token),
                  }),
                "Template published.",
              );
              setTemplate({ ...template, name: "" });
            }}
          >
            <label>
              Template name
              <input
                value={template.name}
                onChange={(e) =>
                  setTemplate({ ...template, name: e.target.value })
                }
                required
              />
            </label>
            <label>
              Type
              <select
                value={template.templateType}
                onChange={(e) =>
                  setTemplate({ ...template, templateType: e.target.value })
                }
              >
                <option>MENU</option>
                <option>RECIPE</option>
                <option>PRICE</option>
              </select>
            </label>
            <button className="scorm-button-primary">Publish template</button>
          </form>
          <form className="control-subform" onSubmit={(e)=>{e.preventDefault();act(()=>api.post(`${endpoint}/dispatches`,dispatch,{headers:authHeaders(token)}),"Central dispatch created.");}}>
            <div className="control-row"><label>Destination<select value={dispatch.destinationBranchId} onChange={(e)=>setDispatch({...dispatch,destinationBranchId:e.target.value})} required><option value="">Choose branch</option>{branches.filter((row)=>row.id!==branchId).map((row)=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label>Template<select value={dispatch.templateId} onChange={(e)=>setDispatch({...dispatch,templateId:e.target.value})}><option value="">Stock dispatch only</option>{data.templates.filter((row)=>row.status==="PUBLISHED").map((row)=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label></div>
            <button className="scorm-button-secondary">Dispatch to outlet</button>
          </form>
          <div className="control-list">
            {data.templates.slice(0, 6).map((row) => (
              <article key={row.id}>
                <span>
                  <strong>{row.name}</strong>
                  <small>
                    {row.templateType} · v{row.version} · {row.status}
                  </small>
                </span>
              </article>
            ))}
          </div>
        </section>
        <section className="control-card">
          <header>
            <FileCheck2 />
            <div>
              <span>Insights</span>
              <h3>Schedules, forecast & anomalies</h3>
            </div>
          </header>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              act(
                () =>
                  api.post(`${endpoint}/automations`, automation, {
                    headers: authHeaders(token),
                  }),
                "Insight schedule saved.",
              );
            }}
          >
            <label>
              Name
              <input
                value={automation.name}
                onChange={(e) =>
                  setAutomation({ ...automation, name: e.target.value })
                }
              />
            </label>
            <div className="control-row">
              <label>
                Report
                <select
                  value={automation.reportType}
                  onChange={(e) =>
                    setAutomation({ ...automation, reportType: e.target.value })
                  }
                >
                  <option>SALES_FORECAST</option>
                  <option>STOCK_ALERT</option>
                  <option>MARGIN_ANOMALY</option>
                </select>
              </label>
              <label>
                Schedule
                <input
                  value={automation.schedule}
                  onChange={(e) =>
                    setAutomation({ ...automation, schedule: e.target.value })
                  }
                />
              </label>
            </div>
            <button className="scorm-button-primary">Save schedule</button>
          </form>
          <div className="control-list">
            {data.automations.map((row) => (
              <article key={row.id}>
                <span>
                  <strong>{row.name}</strong>
                  <small>
                    {row.schedule || "Manual"}
                    {row.lastResult
                      ? ` · forecast ₹${(Number(row.lastResult.forecastNextDayMinor || 0) / 100).toLocaleString("en-IN")}`
                      : ""}
                  </small>
                </span>
                <button
                  onClick={() =>
                    act(
                      () =>
                        api.post(
                          `${endpoint}/automations/${row.id}/run`,
                          {},
                          { headers: authHeaders(token) },
                        ),
                      "Insight refreshed.",
                    )
                  }
                >
                  Run
                </button>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
