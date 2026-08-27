import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Languages,
  RefreshCw,
  Store
} from 'lucide-react';
import { api, apiErrorMessage, authHeaders } from './api';
import './reports.css';

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function monthStart() { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`; }
function bytes(value){const n=Number(value||0);if(!Number.isFinite(n)||n<=0)return '-';if(n<1024)return `${n} B`;if(n<1048576)return `${(n/1024).toFixed(1)} KB`;return `${(n/1048576).toFixed(1)} MB`;}
function reportName(catalog,id){return catalog.find((r)=>r.id===id)?.name||String(id||'').replaceAll('_',' ');}

export default function ReportsWorkspace({ token, access }) {
  const isSuperAdmin=Boolean(access?.isSuperAdmin);
  const tenantMembership=(access?.tenants||[]).find((row)=>['TENANT_ADMIN','AUDITOR'].includes(row.role));
  const branchMemberships=(access?.branches||[]).filter((row)=>['BRANCH_MANAGER','AUDITOR'].includes(row.role));
  const hasTenantView=isSuperAdmin||Boolean(tenantMembership);
  const [catalog,setCatalog]=useState({reports:[],formats:['PDF','XLSX'],locales:[]});
  const [tenants,setTenants]=useState([]);const[branches,setBranches]=useState([]);const[tenantId,setTenantId]=useState('');const[branchId,setBranchId]=useState('');
  const [form,setForm]=useState({reportType:'CONSOLIDATED',format:'PDF',locale:'en',from:monthStart(),to:today()});
  const [history,setHistory]=useState([]);const[busy,setBusy]=useState(false);const[downloading,setDownloading]=useState('');const[error,setError]=useState('');const[notice,setNotice]=useState('');

  useEffect(()=>{async function boot(){try{const{data}=await api.get('/reports/catalog',{headers:authHeaders(token)});setCatalog(data);if(isSuperAdmin){const t=await api.get('/platform/tenants',{headers:authHeaders(token)});const rows=t.data.tenants||[];setTenants(rows);setTenantId(rows[0]?.id||'');}else if(tenantMembership){setTenants(tenantMembership.tenant?[tenantMembership.tenant]:[{id:tenantMembership.tenantId,name:'Assigned business'}]);setTenantId(tenantMembership.tenantId);}else if(branchMemberships.length){const first=branchMemberships[0];const unique=[...new Map(branchMemberships.map((m)=>[m.tenantId,{id:m.tenantId,name:m.branch?.tenantName||'Assigned business'}])).values()];setTenants(unique);setTenantId(first.tenantId);setBranchId(first.branchId);}}catch(err){setError(apiErrorMessage(err));}}boot();},[token,isSuperAdmin,tenantMembership?.tenantId]);

  useEffect(()=>{async function loadBranches(){if(!tenantId)return;try{if(hasTenantView){const{data}=await api.get(`/tenants/${tenantId}/branches`,{headers:authHeaders(token)});const rows=data.branches||[];setBranches(rows);if(branchId&&!rows.some((row)=>row.id===branchId))setBranchId('');}else{const rows=branchMemberships.filter((m)=>m.tenantId===tenantId).map((m)=>m.branch).filter(Boolean);setBranches(rows);if(!rows.some((row)=>row.id===branchId))setBranchId(rows[0]?.id||'');}}catch(err){setError(apiErrorMessage(err));}}loadBranches();},[tenantId,token,hasTenantView]);

  async function loadHistory(){if(!tenantId)return;try{const{data}=await api.get(`/reports/tenants/${tenantId}/history`,{params:branchId?{branchId}:{},headers:authHeaders(token)});setHistory(data.reports||[]);}catch(err){setError(apiErrorMessage(err));}}
  useEffect(()=>{if(tenantId&&(hasTenantView||branchId))loadHistory();},[tenantId,branchId]);

  function flash(msg){setNotice(msg);window.setTimeout(()=>setNotice(''),2800);}

  async function generate(event){event.preventDefault();try{setBusy(true);setError('');const{data}=await api.post(`/reports/tenants/${tenantId}/generate`,{...form,branchId:branchId||null},{headers:authHeaders(token)});await loadHistory();flash(`${reportName(catalog.reports,data.report.reportType)} is ready.`);}catch(err){setError(apiErrorMessage(err));}finally{setBusy(false);}}

  async function download(report){try{setDownloading(report.id);setError('');const response=await api.get(`/reports/tenants/${report.tenantId}/${report.id}/download`,{headers:authHeaders(token),responseType:'blob'});const url=URL.createObjectURL(response.data);const anchor=document.createElement('a');anchor.href=url;anchor.download=report.fileName||`report.${report.format==='XLSX'?'xlsx':'pdf'}`;document.body.appendChild(anchor);anchor.click();anchor.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(err){setError(apiErrorMessage(err));}finally{setDownloading('');}}

  const selected=catalog.reports.find((row)=>row.id===form.reportType);
  const canUseTenantScope=hasTenantView;
  const reportCards=useMemo(()=>catalog.reports||[],[catalog]);

  if(!hasTenantView&&!branchMemberships.length)return <div className="reports-page"><div className="reports-empty"><FileText size={25}/><strong>Reports are not assigned to this account</strong><span>Ask your admin if you need report access.</span></div></div>;

  return <div className="reports-page">
    <section className="reports-hero"><div><div className="reports-mini">Reports</div><h2>Create a report</h2><p>Choose what you need, the branch or whole business, the dates and the file type.</p></div><button className="scorm-button-secondary" onClick={loadHistory}><RefreshCw size={14}/>Refresh</button></section>
    {error&&<div className="reports-error">{error}</div>}{notice&&<div className="reports-notice">{notice}</div>}

    <div className="reports-layout">
      <form className="reports-panel report-builder" onSubmit={generate}>
        <div className="reports-panel-head"><div><div className="reports-mini">Step 1</div><h3>Choose report</h3></div><FileText size={18}/></div>
        <label><span>Business</span><select value={tenantId} onChange={(e)=>{setTenantId(e.target.value);setBranchId('')}}>{tenants.map((row)=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        <label><span>Branch</span><select value={branchId} onChange={(e)=>setBranchId(e.target.value)}>{canUseTenantScope&&<option value="">All branches</option>}{branches.map((row)=><option key={row.id} value={row.id}>{row.name} · {row.code}</option>)}</select></label>
        <label><span>Report type</span><select value={form.reportType} onChange={(e)=>setForm({...form,reportType:e.target.value})}>{reportCards.map((row)=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        {selected&&<div className="report-description">{selected.description}</div>}
        <div className="report-pair"><label><span>From date</span><input type="date" value={form.from} onChange={(e)=>setForm({...form,from:e.target.value})}/></label><label><span>To date</span><input type="date" value={form.to} onChange={(e)=>setForm({...form,to:e.target.value})}/></label></div>
        <div className="report-pair"><label><span>File type</span><select value={form.format} onChange={(e)=>setForm({...form,format:e.target.value})}>{(catalog.formats||[]).map((value)=><option key={value}>{value}</option>)}</select></label><label><span>Language</span><select value={form.locale} onChange={(e)=>setForm({...form,locale:e.target.value})}>{(catalog.locales||[]).map((row)=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label></div>
        <div className="report-language-note"><Languages size={15}/><span>English, हिन्दी and मराठी reports are supported.</span></div>
        <button className="scorm-button-primary report-generate" disabled={busy||!tenantId}><FileText size={14}/>{busy?'Creating report…':'Create report'}</button>
      </form>

      <section className="reports-panel report-catalogue"><div className="reports-panel-head"><div><div className="reports-mini">Quick choice</div><h3>Available reports</h3></div><FileSpreadsheet size={18}/></div><div className="report-card-grid">{reportCards.map((row)=><button type="button" key={row.id} className={form.reportType===row.id?'report-card active':'report-card'} onClick={()=>setForm({...form,reportType:row.id})}><div>{row.id==='INVENTORY_VALUATION'||row.id==='STOCK_MOVEMENTS'?<Store size={16}/>:<FileText size={16}/>}</div><strong>{row.name}</strong><span>{row.description}</span></button>)}</div></section>
    </div>

    <section className="reports-panel history-panel"><div className="reports-panel-head"><div><div className="reports-mini">Previous reports</div><h3>Download reports</h3></div><span className="reports-count">{history.length}</span></div>{!history.length?<div className="reports-empty compact"><FileText size={22}/><strong>No reports yet</strong><span>Reports you create will appear here for download.</span></div>:<div className="report-history"><div className="report-history-head"><span>Report</span><span>Branch</span><span>Dates</span><span>Language</span><span>Status</span><span></span></div>{history.map((report)=><article className="report-history-row" key={report.id}><div className="report-file-icon">{report.format==='XLSX'?<FileSpreadsheet size={17}/>:<FileText size={17}/>}</div><div className="report-history-main"><strong>{reportName(catalog.reports,report.reportType)}</strong><span>{report.fileName||`${report.format} report`} · {bytes(report.sizeBytes)}</span></div><span>{report.branchId?branches.find((b)=>b.id===report.branchId)?.name||'Branch':'All branches'}</span><span>{report.rangeFrom} → {report.rangeTo}</span><span className="report-locale"><Languages size={11}/>{report.locale==='hi'?'हिन्दी':report.locale==='mr'?'मराठी':'English'}</span><span className={`report-status ${report.status.toLowerCase()}`}>{report.status==='READY'&&<CheckCircle2 size={11}/>} {report.status==='READY'?'Ready':report.status}</span><button className="report-download" onClick={()=>download(report)} disabled={report.status!=='READY'||downloading===report.id}><Download size={13}/>{downloading===report.id?'Downloading…':'Download'}</button></article>)}</div>}</section>
  </div>;
}