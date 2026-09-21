import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  LogIn,
  KeyRound,
  Mail,
  Search,
  ShieldCheck,
  Store,
  UserPlus,
  WandSparkles,
  UsersRound
} from 'lucide-react';
import RefreshButton from './RefreshButton';
import { api, apiErrorMessage, authHeaders } from './api';
import { useAuth } from './AuthContext';
import './staff.css';
import { generateStrongPassword } from './credentialUtils';

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
  const { startImpersonation } = useAuth();
  const isSuperAdmin = Boolean(access?.isSuperAdmin);
  const tenantAdmin = (access?.tenants || []).find((row) => row.role === 'TENANT_ADMIN');
  const canManage = isSuperAdmin || Boolean(tenantAdmin);
  const canWorkAsStaff = Boolean(tenantAdmin) && !isSuperAdmin;
  const [tenants, setTenants] = useState([]);
  const [branches, setBranches] = useState([]);
  const [members, setMembers] = useState([]);
  const [tenantId, setTenantId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [form, setForm] = useState({ name: '', username: '', email: '', temporaryPassword: '', role: 'WAITER' });
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [workingAs, setWorkingAs] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [resetTarget, setResetTarget] = useState(null);
  const [resetPassword, setResetPassword] = useState('');

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
      await api.post(`/tenants/${tenantId}/branches/${branchId}/members`, { ...form, email: form.email.trim(), username: form.username.trim() }, { headers: authHeaders(token) });
      setForm({ name: '', username: '', email: '', temporaryPassword: '', role: form.role });
      await loadMembers();
      flash('Staff member added.');
    } catch (err) { setError(apiErrorMessage(err)); }
    finally { setBusy(false); }
  }

  async function resetMemberPassword() {
    try {
      setBusy(true); setError('');
      await api.post(`/tenants/${tenantId}/branches/${branchId}/members/${resetTarget.id}/reset-password`, { temporaryPassword: resetPassword }, { headers: authHeaders(token) });
      setResetTarget(null); setResetPassword(''); await loadMembers(); flash('Temporary password updated.');
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

  async function workAsStaff(member) {
    try {
      setWorkingAs(member.id);
      setError('');
      await startImpersonation(tenantId, member.id);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setWorkingAs('');
    }
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((row) => [row.email, row.role, row.status].some((value) => String(value || '').toLowerCase().includes(q)));
  }, [members, search]);

  if (!canManage) return <div className="staff-page"><div className="staff-empty"><ShieldCheck size={23}/><strong>Staff changes are managed by your Business Admin</strong><span>You do not need to do anything here.</span></div></div>;

  const selectedBranch = branches.find((row) => row.id === branchId);

  return <div className="staff-page">
    <section className="staff-hero"><div><div className="staff-mini">Staff</div><h2>Add people & choose their job</h2><p>Create a private username and temporary password for each person. Business Admins can also temporarily work as a staff member for monitoring or emergency cover.</p></div><RefreshButton onRefresh={loadMembers} busy={busy}/></section>

    <div className="staff-scope"><label><span>Business</span><select value={tenantId} onChange={(e)=>{setTenantId(e.target.value);setBranchId('')}}>{!tenants.length&&<option value="">No business</option>}{tenants.map((row)=><option value={row.id} key={row.id}>{row.name}</option>)}</select></label><label><span>Branch</span><select value={branchId} onChange={(e)=>setBranchId(e.target.value)}>{!branches.length&&<option value="">No branch</option>}{branches.map((row)=><option value={row.id} key={row.id}>{row.name} · {row.code}</option>)}</select></label></div>
    {error&&<div className="staff-error">{error}</div>}{notice&&<div className="staff-notice">{notice}</div>}

    {!branchId ? <div className="staff-empty"><Store size={23}/><strong>Choose a branch</strong><span>Select the branch where this person will work.</span></div> : <div className="staff-layout">
      <form className="staff-panel staff-form" onSubmit={assign}>
        <div className="staff-panel-head"><div><div className="staff-mini">{selectedBranch?.name || 'Selected branch'}</div><h3>Add staff member</h3></div><UserPlus size={18}/></div>
        <label><span>Staff name</span><input value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})} required/></label>
        <label><span>Username</span><input value={form.username} onChange={(e)=>setForm({...form,username:e.target.value})} placeholder="rahul.cashier" required/></label>
        <label><span>Email (optional)</span><div className="staff-input-icon"><Mail size={14}/><input type="email" value={form.email} onChange={(e)=>setForm({...form,email:e.target.value})} placeholder="person@example.com"/></div></label>
        <label><span>Temporary password</span><div className="credential-input-row"><input type="text" value={form.temporaryPassword} onChange={(e)=>setForm({...form,temporaryPassword:e.target.value})} required/><button type="button" onClick={()=>setForm({...form,temporaryPassword:generateStrongPassword()})}><WandSparkles size={14}/>Generate</button></div></label>
        <label><span>What is their job?</span><select value={form.role} onChange={(e)=>setForm({...form,role:e.target.value})}>{ROLES.map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
        <div className="staff-role-note"><ShieldCheck size={15}/><span>Use a separate username for each person. They must replace the temporary password on first sign-in.</span></div>
        <button className="scorm-button-primary staff-submit" disabled={busy}><UserPlus size={14}/>Add staff member</button>
      </form>

      <section className="staff-panel">
        <div className="staff-panel-head"><div><div className="staff-mini">{selectedBranch?.name || 'Branch'}</div><h3>People working here</h3></div><span className="staff-count"><UsersRound size={13}/>{members.length}</span></div>
        <label className="staff-search"><Search size={14}/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search by email or job..."/></label>
        {!visible.length ? <div className="staff-empty compact"><UsersRound size={21}/><strong>No staff added yet</strong><span>Add a manager, waiter, cashier, stock manager or auditor.</span></div> : <div className="staff-list">{visible.map((member)=><article className="staff-row" key={member.id}><div className="staff-avatar">{(member.user?.name || member.user?.credential?.username || 'ST').slice(0,2).toUpperCase()}</div><div className="staff-identity"><strong>{member.user?.name || member.user?.credential?.username || member.email}</strong><span>{member.user?.credential?.username || 'No manual login'} · {prettyRole(member.role)}</span></div><span className={`staff-status ${member.status==='ACTIVE'?'active':member.status==='INVITED'?'invited':'suspended'}`}>{member.status==='ACTIVE'?<CheckCircle2 size={11}/>:null}{member.status==='INVITED'?'WAITING':member.status}</span><div className="staff-row-actions">{member.user?.credential&&<button className="staff-work-as" onClick={()=>{setResetTarget(member);setResetPassword(generateStrongPassword())}}><KeyRound size={12}/>Reset</button>}{canWorkAsStaff && member.status !== 'SUSPENDED' && <button className="staff-work-as" onClick={()=>workAsStaff(member)} disabled={Boolean(workingAs)}><LogIn size={12}/>{workingAs===member.id?'Opening…':'Work as'}</button>}<button className="staff-access-action" onClick={()=>toggleStatus(member)} disabled={member.status==='INVITED'}>{member.status==='SUSPENDED'?'Restore':'Suspend'}<ChevronRight size={12}/></button></div></article>)}</div>}
      </section>
    </div>}
    {resetTarget&&<div className="tenant-delete-modal" role="dialog" aria-modal="true"><button className="tenant-delete-backdrop" onClick={()=>setResetTarget(null)} aria-label="Close"/><div className="tenant-delete-card"><h3>Reset staff password</h3><p>They must change this temporary password after signing in.</p><label>Temporary password<div className="credential-input-row"><input value={resetPassword} onChange={(e)=>setResetPassword(e.target.value)}/><button type="button" onClick={()=>setResetPassword(generateStrongPassword())}><WandSparkles size={14}/>Generate</button></div></label><div className="tenant-delete-actions"><button type="button" className="scorm-button-secondary" onClick={()=>setResetTarget(null)}>Cancel</button><button type="button" className="scorm-button-primary" onClick={resetMemberPassword} disabled={busy}>Reset password</button></div></div></div>}
  </div>;
}
