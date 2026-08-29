import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Banknote,
  Building2,
  CalendarDays,
  CircleDollarSign,
  CreditCard,
  PackageSearch,
  Plus,
  RefreshCw,
  Store,
  TrendingUp,
  UsersRound,
  Wine
} from 'lucide-react';
import { api, apiErrorMessage, authHeaders } from './api';
import './analytics.css';

function formatMoney(value) {
  try {
    const amount = BigInt(value || 0);
    const negative = amount < 0n;
    const abs = negative ? -amount : amount;
    return `${negative ? '-' : ''}₹${(abs / 100n).toLocaleString('en-IN')}.${String(abs % 100n).padStart(2, '0')}`;
  } catch (_) { return '₹0.00'; }
}

function moneyToMinor(value) {
  const text = String(value || '').trim().replace(/,/g, '');
  const match = text.match(/^(\d+)(?:\.(\d{0,2}))?$/);
  if (!match) throw new Error('Enter a valid amount with up to two decimal places.');
  return (BigInt(match[1]) * 100n + BigInt((match[2] || '').padEnd(2, '0') || '0')).toString();
}

function localDate(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

function monthStart() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-01`;
}

function pct(value, max) {
  try {
    const a = BigInt(value || 0); const b = BigInt(max || 0);
    if (b <= 0n) return 0;
    return Math.max(3, Math.min(100, Number((a * 10000n) / b) / 100));
  } catch (_) { return 0; }
}

function Metric({ label, value, note, icon: Icon, warn = false }) {
  return <article className={`analytics-metric ${warn?'warn':''}`}><div><span>{label}</span><strong>{value}</strong><small>{note}</small></div><div className="analytics-metric-icon"><Icon size={17}/></div></article>;
}

export default function AnalyticsWorkspace({ token, access }) {
  const isSuperAdmin = Boolean(access?.isSuperAdmin);
  const tenantAdmin = (access?.tenants || []).find((row)=>row.role==='TENANT_ADMIN');
  const tenantAuditor = (access?.tenants || []).find((row)=>row.role==='AUDITOR');
  const branchAnalyticsMemberships = (access?.branches || []).filter((row)=>['BRANCH_MANAGER','AUDITOR'].includes(row.role));
  const hasTenantView = isSuperAdmin || Boolean(tenantAdmin || tenantAuditor);
  const [tenants,setTenants]=useState([]);
  const [branches,setBranches]=useState([]);
  const [tenantId,setTenantId]=useState('');
  const [branchId,setBranchId]=useState('');
  const [from,setFrom]=useState(monthStart());
  const [to,setTo]=useState(localDate());
  const [analytics,setAnalytics]=useState(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [expense,setExpense]=useState({expenseDate:localDate(),category:'Operating Expense',description:'',amount:''});
  const [tab,setTab]=useState('Overview');

  useEffect(()=>{
    async function init(){
      try{
        if(isSuperAdmin){const {data}=await api.get('/platform/tenants',{headers:authHeaders(token)});const rows=data.tenants||[];setTenants(rows);setTenantId(rows[0]?.id||'');}
        else if(tenantAdmin||tenantAuditor){const membership=tenantAdmin||tenantAuditor;setTenants(membership.tenant?[membership.tenant]:[]);setTenantId(membership.tenantId);}
        else if(branchAnalyticsMemberships.length){const first=branchAnalyticsMemberships[0];setTenants([{id:first.tenantId,name:first.branch?.tenantName||'Assigned business'}]);setTenantId(first.tenantId);setBranchId(first.branchId);}
      }catch(err){setError(apiErrorMessage(err));}
    }
    init();
  },[token,isSuperAdmin,tenantAdmin?.tenantId,tenantAuditor?.tenantId]);

  useEffect(()=>{
    async function loadBranches(){
      if(!tenantId)return;
      try{
        let rows=[];
        if(hasTenantView){const {data}=await api.get(`/tenants/${tenantId}/branches`,{headers:authHeaders(token)});rows=data.branches||[];}
        else rows=branchAnalyticsMemberships.filter((row)=>row.tenantId===tenantId).map((row)=>row.branch).filter(Boolean);
        setBranches(rows);
        if(!hasTenantView&&!rows.some((row)=>row.id===branchId))setBranchId(rows[0]?.id||'');
        if(branchId&&!rows.some((row)=>row.id===branchId))setBranchId('');
      }catch(err){setError(apiErrorMessage(err));}
    }
    loadBranches();
  },[tenantId,token,hasTenantView]);

  async function load(){
    if(!tenantId)return;
    try{
      setBusy(true);setError('');
      const path=branchId?`/analytics/tenants/${tenantId}/branches/${branchId}/overview`:`/analytics/tenants/${tenantId}/overview`;
      const {data}=await api.get(path,{params:{from,to},headers:authHeaders(token)});
      setAnalytics(data.analytics||null);
    }catch(err){setError(apiErrorMessage(err));}
    finally{setBusy(false);}
  }

  useEffect(()=>{if(tenantId&&(hasTenantView||branchId))load();},[tenantId,branchId]);

  const selectedBranch=branches.find((row)=>row.id===branchId);
  const selectedBranchRole=(access?.branches||[]).find((row)=>row.branchId===branchId)?.role;
  const canPostExpense=Boolean(branchId&&(isSuperAdmin||tenantAdmin||selectedBranchRole==='BRANCH_MANAGER'));
  const summary=analytics?.summary||{};
  const maxBranch=useMemo(()=>Math.max(0,...(analytics?.branches||[]).map((row)=>Number(row.salesMinor||0))),[analytics]);
  const maxTrend=useMemo(()=>Math.max(0,...(analytics?.salesTrend||[]).map((row)=>Number(row.salesMinor||0))),[analytics]);
  const maxProduct=useMemo(()=>Math.max(0,...(analytics?.topProducts||[]).map((row)=>Number(row.salesMinor||0))),[analytics]);

  function flash(message){setNotice(message);window.setTimeout(()=>setNotice(''),2600);}

  async function postExpense(event){
    event.preventDefault();
    try{
      if(!canPostExpense)throw new Error('Choose a branch you manage.');
      setBusy(true);setError('');
      await api.post(`/analytics/tenants/${tenantId}/branches/${branchId}/expenses`,{
        expenseDate:expense.expenseDate,category:expense.category.trim(),description:expense.description.trim(),amountMinor:moneyToMinor(expense.amount)
      },{headers:authHeaders(token)});
      setExpense({...expense,description:'',amount:''});await load();flash('Expense saved.');
    }catch(err){setError(err.message||apiErrorMessage(err));}
    finally{setBusy(false);}
  }

  if(!hasTenantView&&!branchAnalyticsMemberships.length){return <div className="analytics-page"><div className="analytics-empty"><BarChart3 size={24}/><strong>Sales & Profit is not assigned to this account</strong><span>Ask your admin if you need access.</span></div></div>}

  return <div className="analytics-page">
    <section className="analytics-hero"><div><div className="analytics-mini">Sales & Profit</div><h2>How is the business doing?</h2><p>See sales, item cost, profit, expenses, stock and open restaurant bills in one place.</p></div><button className="scorm-button-secondary" onClick={load} disabled={busy}><RefreshCw size={14} className={busy?'spin':''}/>Refresh</button></section>

    <div className="analytics-controls"><label><span>Business</span><select value={tenantId} onChange={(e)=>{setTenantId(e.target.value);setBranchId('')}}>{tenants.map((row)=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label><span>Branch</span><select value={branchId} onChange={(e)=>setBranchId(e.target.value)}>{hasTenantView&&<option value="">All branches</option>}{branches.map((row)=><option key={row.id} value={row.id}>{row.name} · {row.code}</option>)}</select></label><label><span>From date</span><input type="date" value={from} onChange={(e)=>setFrom(e.target.value)}/></label><label><span>To date</span><input type="date" value={to} onChange={(e)=>setTo(e.target.value)}/></label><button className="scorm-button-primary" onClick={load} disabled={busy}><CalendarDays size={14}/>Show</button></div>
    {error&&<div className="analytics-error">{error}</div>}{notice&&<div className="analytics-notice">{notice}</div>}

    {analytics&&<>
      <div className="analytics-metrics">
        <Metric label="Sales today" value={formatMoney(analytics.today?.salesMinor)} note={`${analytics.today?.paidOrders||0} paid orders`} icon={TrendingUp}/>
        <Metric label="Sales this month" value={formatMoney(analytics.mtd?.salesMinor)} note={`${analytics.mtd?.paidOrders||0} paid orders`} icon={CalendarDays}/>
        <Metric label="Sales in selected dates" value={formatMoney(summary.salesMinor)} note={`${summary.paidOrders||0} paid orders`} icon={CircleDollarSign}/>
        <Metric label="Gross profit" value={formatMoney(summary.grossProfitMinor)} note={`Item cost ${formatMoney(summary.cogsMinor)}`} icon={Activity}/>
        <Metric label="Profit after expenses" value={formatMoney(summary.operatingProfitMinor)} note={`Expenses ${formatMoney(summary.expenseMinor)}`} icon={Banknote} warn={BigInt(summary.operatingProfitMinor||0)<0n}/>
        <Metric label="Stock value" value={formatMoney(analytics.inventory?.inventoryValueMinor)} note={`${analytics.inventory?.stockedProducts||0} stocked items`} icon={PackageSearch}/>
        <Metric label="Bills not closed" value={String(analytics.unresolved?.orderCount||0)} note={formatMoney(analytics.unresolved?.totalMinor)} icon={UsersRound} warn={Number(analytics.unresolved?.orderCount||0)>0}/>
      </div>

      <div className="workspace-tabs">{[{label:'Branches & Payments',icon:Building2},{label:'Trends & Products',icon:TrendingUp},{label:'Stock & Team',icon:AlertTriangle},{label:'Expenses',icon:Banknote}].map(({label,icon:Icon})=><button key={label} className={tab===label?'is-active':''} onClick={()=>setTab(label)}><Icon size={15}/>{label}</button>)}</div>

      {tab==='Branches & Payments' && <div className="analytics-grid-two">
        <section className="analytics-panel"><div className="analytics-panel-head"><div><div className="analytics-mini">Branches</div><h3>{branchId?selectedBranch?.name||'Selected branch':'Sales by branch'}</h3></div><Building2 size={18}/></div><div className="analytics-rows">{!(analytics.branches||[]).length?<div className="analytics-empty compact"><Store size={20}/><strong>No sales in these dates</strong></div>:(analytics.branches||[]).map((row)=><div className="analytics-branch-row" key={row.branchId}><div><strong>{row.name}</strong><span>{row.code} · {row.type==='BAR_RESTAURANT'?'Restaurant':'Wine Shop'}</span></div><div className="analytics-bar"><i style={{width:`${pct(row.salesMinor,maxBranch)}%`}}/></div><div className="analytics-values"><strong>{formatMoney(row.salesMinor)}</strong><span>{formatMoney(row.grossProfitMinor)} profit</span></div></div>)}</div></section>

        <section className="analytics-panel"><div className="analytics-panel-head"><div><div className="analytics-mini">Payments</div><h3>How customers paid</h3></div><CreditCard size={18}/></div><div className="analytics-payment-grid">{(analytics.paymentMix||[]).map((row)=><div key={row.method}><span>{row.method}</span><strong>{formatMoney(row.amountMinor)}</strong><small>{row.paymentCount} payments</small></div>)}{!(analytics.paymentMix||[]).length&&<div className="analytics-empty compact"><CreditCard size={20}/><strong>No payments in these dates</strong></div>}</div></section>
      </div>}

      {tab==='Trends & Products' && <>
      <div className="analytics-grid-two">
        <section className="analytics-panel"><div className="analytics-panel-head"><div><div className="analytics-mini">Sales over time</div><h3>Daily sales</h3></div><TrendingUp size={18}/></div><div className="analytics-trend">{(analytics.salesTrend||[]).map((row)=><div className="analytics-trend-col" key={row.date}><div className="analytics-trend-value">{formatMoney(row.salesMinor)}</div><div className="analytics-trend-track"><i style={{height:`${pct(row.salesMinor,maxTrend)}%`}}/></div><span>{row.date.slice(5)}</span></div>)}{!(analytics.salesTrend||[]).length&&<div className="analytics-empty compact"><TrendingUp size={20}/><strong>No sales in these dates</strong></div>}</div></section>

        <section className="analytics-panel"><div className="analytics-panel-head"><div><div className="analytics-mini">Alcohol sales</div><h3>Bottles & pours</h3></div><Wine size={18}/></div><div className="alcohol-mix">{(analytics.alcoholMix||[]).map((row)=><div key={row.mode}><span>{row.mode}</span><strong>{Number(row.mlSold||0).toLocaleString('en-IN',{maximumFractionDigits:0})} ML</strong><small>{formatMoney(row.salesMinor)} · {row.lines} sales lines</small></div>)}{!(analytics.alcoholMix||[]).length&&<div className="analytics-empty compact"><Wine size={20}/><strong>No alcohol sales in these dates</strong></div>}</div></section>
      </div>

      <section className="analytics-panel"><div className="analytics-panel-head"><div><div className="analytics-mini">Popular items</div><h3>Top selling items</h3></div><BarChart3 size={18}/></div><div className="analytics-products">{(analytics.topProducts||[]).map((row)=><div className="analytics-product-row" key={row.productId}><div><strong>{row.name}</strong><span>{row.brand||row.productType} · {Number(row.baseQuantity||0).toLocaleString('en-IN',{maximumFractionDigits:1})} {row.inventoryUnit}</span></div><div className="analytics-bar"><i style={{width:`${pct(row.salesMinor,maxProduct)}%`}}/></div><div><strong>{formatMoney(row.salesMinor)}</strong><span>{formatMoney(row.grossProfitMinor)} profit</span></div></div>)}</div></section>
      </>}

      {tab==='Stock & Team' && <>
      <div className="analytics-grid-two">
        <section className="analytics-panel"><div className="analytics-panel-head"><div><div className="analytics-mini">Stock</div><h3>Low stock</h3></div><AlertTriangle size={18}/></div><div className="analytics-low-stock">{(analytics.lowStock||[]).map((row)=><div key={`${row.branchId}-${row.productId}`}><div><strong>{row.name}</strong><span>{row.branchName} · {row.brand||row.productType}</span></div><strong>{Number(row.quantityBase||0).toLocaleString('en-IN',{maximumFractionDigits:3})} {row.inventoryUnit}</strong></div>)}{!(analytics.lowStock||[]).length&&<div className="analytics-empty compact"><PackageSearch size={20}/><strong>No low-stock items</strong></div>}</div></section>

        <section className="analytics-panel"><div className="analytics-panel-head"><div><div className="analytics-mini">Needs attention</div><h3>Wastage & open bills</h3></div><AlertTriangle size={18}/></div><div className="control-cards"><div><span>Wastage cost</span><strong>{formatMoney(analytics.wastage?.costMinor)}</strong><small>{analytics.wastage?.movements||0} entries · {Number(analytics.wastage?.quantityBase||0).toLocaleString('en-IN',{maximumFractionDigits:2})} units</small></div><div><span>Open bills</span><strong>{analytics.unresolved?.orderCount||0}</strong><small>{formatMoney(analytics.unresolved?.totalMinor)} · {analytics.unresolved?.waitersAffected||0} staff</small></div></div></section>
      </div>

      {(analytics.waiterPerformance||[]).length>0&&<section className="analytics-panel"><div className="analytics-panel-head"><div><div className="analytics-mini">Restaurant team</div><h3>Waiter orders</h3></div><UsersRound size={18}/></div><div className="analytics-waiter-table"><div className="analytics-waiter-head"><span>Waiter</span><span>Paid</span><span>Open</span><span>Sales</span></div>{analytics.waiterPerformance.map((row)=><div className="analytics-waiter-row" key={row.userId||row.name}><div><strong>{row.name}</strong><span>{row.email||'No waiter assigned'}</span></div><span>{row.paidOrders}</span><span className={Number(row.unresolvedOrders)>0?'warn-text':''}>{row.unresolvedOrders}</span><strong>{formatMoney(row.salesMinor)}</strong></div>)}</div></section>}
      </>}

      {tab==='Expenses' && <div className="analytics-grid-two">
        <section className="analytics-panel"><div className="analytics-panel-head"><div><div className="analytics-mini">Expenses</div><h3>Where money was spent</h3></div><Banknote size={18}/></div><div className="expense-mix">{(analytics.expenseCategories||[]).map((row)=><div key={row.category}><span>{row.category}</span><strong>{formatMoney(row.amountMinor)}</strong><small>{row.count} entries</small></div>)}{!(analytics.expenseCategories||[]).length&&<div className="analytics-empty compact"><Banknote size={20}/><strong>No expenses in these dates</strong></div>}</div></section>
        {canPostExpense?<form className="analytics-panel expense-form" onSubmit={postExpense}><div className="analytics-panel-head"><div><div className="analytics-mini">{selectedBranch?.name}</div><h3>Add an expense</h3></div><Plus size={18}/></div><label><span>Date</span><input type="date" value={expense.expenseDate} onChange={(e)=>setExpense({...expense,expenseDate:e.target.value})} required/></label><label><span>Type</span><input value={expense.category} onChange={(e)=>setExpense({...expense,category:e.target.value})} placeholder="Rent, electricity, salary..." required/></label><label><span>Amount ₹</span><input inputMode="decimal" value={expense.amount} onChange={(e)=>setExpense({...expense,amount:e.target.value})} placeholder="12500.00" required/></label><label><span>Note (optional)</span><textarea rows="3" value={expense.description} onChange={(e)=>setExpense({...expense,description:e.target.value})} placeholder="What was this expense for?"/></label><button className="scorm-button-primary" disabled={busy}><Plus size={14}/>Save expense</button></form>:<section className="analytics-panel"><div className="analytics-empty"><Banknote size={22}/><strong>Choose a branch to add an expense</strong><span>Expenses are always saved against one branch.</span></div></section>}
      </div>}
    </>}
  </div>;
}