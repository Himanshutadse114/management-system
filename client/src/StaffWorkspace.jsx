import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  Mail,
  RefreshCw,
  Search,
  ShieldCheck,
  Store,
  UserPlus,
  UsersRound
} from 'lucide-react';
import { api, apiErrorMessage, authHeaders } from './api';
import './staff.css';

const ROLES = [
  ['BRANCH_MANAGER', 'Branch Manager'],
  ['INVENTORY_MANAGER', 'Stock Manager'],
  ['CASHIER', 'Cashier'],
  ['WAITER', 'Waiter'],
  ['AUDITOR', 'Auditor / Reports']
];

function prettyRole(value) {
  const labels = { BRANCH_MANAGER:'Branch Manager', INVENTORY_MANAGER:'Stock Manager', CASHIER:'Cashier', WAITER:'Waiter', AUDITOR:'Auditor / Reports' };
  return labels[value] || String(value || '').toLowerCase().split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

export default function StaffWorkspace({ token, access }) {
  const isSuperAdmin = Boolean(access?.isSuperAdmin);
  const tenantAdmin = (access?.tenants || []).find((row) => row.role === 'TENANT_ADMIN');
  const canManage = isSuperAdmin || Boolean(tenantAdmin);
  const [tenants, setTenants] = useState([]);
  const [branches, setBranches] = useState([]);
  const [members, setMembers] = useState([]);
  const [tenantId, setTenantId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [form, setForm] = useState({ email: '', role: 'WAITER' });
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!canManage) return;
    async function loadTenants() {
      try {
        if (isSuperAdmin) {
          const { data } = await api.get('/platform/tenants', { headers: authHeaders(token) });
          const rows = data.tenants || [];
          setTenants(rows);
          setTenantId((current) => current || rows[0]?.id || '');
        } else {
          const row = tenantAdmin?.tenant ? [tenantAdmin.tenant] : [];
          setTenants(row);
          setTenantId(tenantAdmin?.tenantId || '');
        }
      } catch (err) { setError(apiErrorMessage(err)); }
    }
    loadTenants();
  }, [token, isSuperAdmin, tenantAdmin?.tenantId, canManage]);

  useEffect(() => {
    if (!tenantId || !canManage) return;
    async function loadBranches() {
      try {
        setError('');
        const { data } = await api.get(`/tenants/${tenantId}/branches`, { headers: authHeaders(token) });
        const rows = data.branches || [];
        setBranches(rows);
        setBranchId((current) => rows.some((row) => row.id === current) ? current : rows[0]?.id || '');
      } catch (err) { setError(apiErrorMessage(err)); }
    }
    loadBranches();
  }, [tenantId, token, canManage]);

  async function loadMembers() {
    if (!tenantId || !branchId || !canManage) return;
    try {
      setBusy(true); setError('');
      const { data } = await api.get(`/tenants/${tenantId}/branches/${branchId}/members`, { headers: authHeaders(token) });
      setMembers(data.memberships || []);
    } catch (err) { setError(apiErrorMessage(err)); }
    finally { setBusy(false); }
  }

  useEffect(() => { loadMembers(); }, [tenantId, branchId]);

  function flash(message) { setNotice(message); window.setTimeout(() => setNotice(''), 2600); }

  async function assign(event) {
    event.preventDefault();
    if (!branchId) return;
    try {
      setBusy(true); setError('');
      await api.post(`/tenants/${tenantId}/branches/${branchId}/members`, { email: form.email.trim(), role: form.role }, { headers: authHeaders(token) });
      setForm({ email: '', role: form.role });
      await loadMembers();
      flash('Staff member added.');
    } catch (err) { setError(apiErrorMessage(err)); }
    finally { setBusy(false); }
  }

  async function toggleStatus(member) {
    const status = member.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
    try {
      setError('');
      await api.patch(`/tenants/${tenantId}/branches/${branchId}/members/${member.id}/status`, { status }, { headers: authHeaders(token) });
      await loadMembers();
      flash(status === 'ACTIVE' ? 'Staff member restored.' : 'Staff member suspended.');
    } catch (err) { setError(apiErrorMessage(err)); }
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((row) => [row.email, row.role, row.status].some((value) => String(value || '').toLowerCase().includes(q)));
  }, [members, search]);

  if (!canManage) return <div className="staff-page"><div className="staff-empty"><ShieldCheck size={23}/><strong>Staff changes are managed by your Business Admin</strong><span>You do not need to do anything here.</span></div></div>;

  const selectedBranch = branches.find((row) => row.id === branchId);

  return <div className="staff-page">
    <section className="staff-hero"><div><div className="staff-mini">Staff</div><h2>Add people & choose their job</h2><p>Add each person with their own Google email. The system will automatically show them only the screens needed for their job.</p></div><button className="scorm-button-secondary" onClick={loadMembers} disabled={busy}><RefreshCw size={14} className={busy?'spin':''}/>Refresh</button></section>

    <div className="staff-scope"><label><span>Business</span><select value={tenantId} onChange={(e)=>{setTenantId(e.target.value);setBranchId('')}}>{!tenants.length&&<option value="">No business</option>}{tenants.map((row)=><option value={row.id} key={row.id}>{row.name}</option>)}</select></label><label><span>Branch</span><select value={branchId} onChange={(e)=>setBranchId(e.target.value)}>{!branches.length&&<option value="">No branch</option>}{branches.map((row)=><option value={row.id} key={row.id}>{row.name} · {row.code}</option>)}</select></label></div>
    {error&&<div className="staff-error">{error}</div>}{notice&&<div className="staff-notice">{notice}</div>}

    {!branchId ? <div className="staff-empty"><Store size={23}/><strong>Choose a branch</strong><span>Select the branch where this person will work.</span></div> : <div className="staff-layout">
      <form className="staff-panel staff-form" onSubmit={assign}>
        <div className="staff-panel-head"><div><div className="staff-mini">{selectedBranch?.name || 'Selected branch'}</div><h3>Add staff member</h3></div><UserPlus size={18}/></div>
        <label><span>Google email</span><div className="staff-input-icon"><Mail size={14}/><input type="email" value={form.email} onChange={(e)=>setForm({...form,email:e.target.value})} placeholder="person@example.com" required/></div></label>
        <label><span>What is their job?</span><select value={form.role} onChange={(e)=>setForm({...form,role:e.target.value})}>{ROLES.map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
        <div className="staff-role-note"><ShieldCheck size={15}/><span>Use a separate email for each person. This keeps every order, payment and stock change linked to the correct staff member.</span></div>
        <button className="scorm-button-primary staff-submit" disabled={busy}><UserPlus size={14}/>Add staff member</button>
      </form>

      <section className="staff-panel">
        <div className="staff-panel-head"><div><div className="staff-mini">{selectedBranch?.name || 'Branch'}</div><h3>People working here</h3></div><span className="staff-count"><UsersRound size={13}/>{members.length}</span></div>
        <label className="staff-search"><Search size={14}/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search by email or job..."/></label>
        {!visible.length ? <div className="staff-empty compact"><UsersRound size={21}/><strong>No staff added yet</strong><span>Add a manager, waiter, cashier, stock manager or auditor.</span></div> : <div className="staff-list">{visible.map((member)=><article className="staff-row" key={member.id}><div className="staff-avatar">{member.email?.slice(0,2).toUpperCase()}</div><div className="staff-identity"><strong>{member.email}</strong><span>{prettyRole(member.role)} · {member.userId?'Ready to use':'Waiting for first sign in'}</span></div><span className={`staff-status ${member.status==='ACTIVE'?'active':member.status==='INVITED'?'invited':'suspended'}`}>{member.status==='ACTIVE'?<CheckCircle2 size={11}/>:null}{member.status==='INVITED'?'WAITING':member.status}</span><button className="staff-access-action" onClick={()=>toggleStatus(member)} disabled={member.status==='INVITED'}>{member.status==='SUSPENDED'?'Restore':'Suspend'}<ChevronRight size={12}/></button></article>)}</div>}
      </section>
    </div>}
  </div>;
}