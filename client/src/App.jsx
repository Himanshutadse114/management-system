import React, { useEffect, useMemo, useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import {
  BarChart3,
  Building2,
  CheckCircle2,
  CircleUserRound,
  ClipboardList,
  LogOut,
  PackageSearch,
  RefreshCw,
  ShieldCheck,
  Store,
  UsersRound,
  Wine
} from 'lucide-react';
import { useAuth } from './AuthContext';
import { api, apiErrorMessage, authHeaders } from './api';

function LoginScreen() {
  const { loginWithGoogle } = useAuth();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleCredential(response) {
    try {
      setBusy(true);
      setError('');
      await loginWithGoogle(response.credential);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-visual">
        <div className="brand-mark"><Wine size={26} /></div>
        <div className="login-copy">
          <span className="eyebrow">Multi-outlet operations</span>
          <h1>One view for every outlet, every pour, every sale.</h1>
          <p>Inventory, restaurant orders, wine-shop sales, waiter accountability and management analytics built around strict branch-level access.</p>
        </div>
        <div className="feature-strip">
          <span><CheckCircle2 size={17} /> ML-based alcohol stock</span>
          <span><CheckCircle2 size={17} /> Multi-tenant controls</span>
          <span><CheckCircle2 size={17} /> QR menu ready</span>
        </div>
      </section>

      <section className="login-panel-wrap">
        <div className="login-panel">
          <div className="mini-brand"><span className="brand-dot" /> Outlet Management</div>
          <h2>Welcome back</h2>
          <p className="muted">Sign in using the Google account assigned by your administrator.</p>
          <div className={busy ? 'google-wrap is-busy' : 'google-wrap'}>
            <GoogleLogin
              onSuccess={handleCredential}
              onError={() => setError('Google sign-in could not be completed.')}
              width="320"
              shape="pill"
              text="continue_with"
            />
          </div>
          {error && <div className="error-box">{error}</div>}
          <div className="security-note"><ShieldCheck size={18} /> Google identity is verified again by the backend before access is granted.</div>
        </div>
      </section>
    </main>
  );
}

function PendingScreen() {
  const { session, refresh, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function checkAgain() {
    try {
      setBusy(true);
      setMessage('');
      const next = await refresh();
      if (next?.pendingApproval) setMessage('Approval is still pending.');
    } catch (error) {
      setMessage(apiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="center-page">
      <section className="status-card">
        <div className="status-icon"><ShieldCheck size={30} /></div>
        <span className="eyebrow">Google account verified</span>
        <h1>Waiting for access assignment</h1>
        <p>Your account <strong>{session?.user?.email}</strong> is verified, but it has not yet been assigned to a tenant or branch.</p>
        <p className="muted">Once the Super Admin or Tenant Admin assigns your role, the same login will automatically unlock the authorised workspace.</p>
        {message && <div className="info-box">{message}</div>}
        <div className="button-row">
          <button className="primary-btn" onClick={checkAgain} disabled={busy}><RefreshCw size={17} /> {busy ? 'Checking…' : 'Check approval'}</button>
          <button className="ghost-btn" onClick={logout}><LogOut size={17} /> Sign out</button>
        </div>
      </section>
    </main>
  );
}

function PlatformTenants({ token }) {
  const [tenants, setTenants] = useState([]);
  const [name, setName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const { data } = await api.get('/platform/tenants', { headers: authHeaders(token) });
      setTenants(data.tenants || []);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  useEffect(() => { load(); }, []);

  async function createTenant(event) {
    event.preventDefault();
    try {
      setBusy(true);
      setError('');
      await api.post('/platform/tenants', { name, tenantAdminEmail: adminEmail }, { headers: authHeaders(token) });
      setName('');
      setAdminEmail('');
      await load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="workspace-grid">
      <div className="panel-card">
        <div className="section-heading"><div><span className="eyebrow">Super Admin</span><h3>Create tenant</h3></div><Building2 /></div>
        <form className="form-stack" onSubmit={createTenant}>
          <label>Business / group name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sunrise Hospitality" required /></label>
          <label>First Tenant Admin email<input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="owner@example.com" /></label>
          <button className="primary-btn" disabled={busy}>{busy ? 'Creating…' : 'Create tenant'}</button>
        </form>
        {error && <div className="error-box">{error}</div>}
      </div>
      <div className="panel-card span-two">
        <div className="section-heading"><div><span className="eyebrow">Platform</span><h3>Tenants</h3></div><span className="count-pill">{tenants.length}</span></div>
        <div className="tenant-list">
          {tenants.length === 0 && <div className="empty-state">No tenants created yet.</div>}
          {tenants.map((tenant) => (
            <div className="tenant-row" key={tenant.id}>
              <div className="tenant-avatar">{tenant.name.slice(0, 2).toUpperCase()}</div>
              <div><strong>{tenant.name}</strong><span>{tenant.slug}</span></div>
              <span className={`status-pill ${tenant.status === 'ACTIVE' ? 'success' : ''}`}>{tenant.status}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TenantBranches({ token, membership }) {
  const tenantId = membership?.tenantId;
  const [branches, setBranches] = useState([]);
  const [form, setForm] = useState({ name: '', code: '', type: 'BAR_RESTAURANT' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!tenantId) return;
    try {
      const { data } = await api.get(`/tenants/${tenantId}/branches`, { headers: authHeaders(token) });
      setBranches(data.branches || []);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  useEffect(() => { load(); }, [tenantId]);

  async function createBranch(event) {
    event.preventDefault();
    try {
      setBusy(true);
      setError('');
      await api.post(`/tenants/${tenantId}/branches`, form, { headers: authHeaders(token) });
      setForm({ name: '', code: '', type: 'BAR_RESTAURANT' });
      await load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="workspace-grid">
      <div className="panel-card">
        <div className="section-heading"><div><span className="eyebrow">Tenant Admin</span><h3>Add branch</h3></div><Store /></div>
        <form className="form-stack" onSubmit={createBranch}>
          <label>Branch name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Central Bar & Kitchen" required /></label>
          <label>Branch code<input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="CBK-01" required /></label>
          <label>Outlet type<select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option value="BAR_RESTAURANT">Bar + Restaurant</option><option value="WINE_SHOP">Wine Shop</option></select></label>
          <button className="primary-btn" disabled={busy}>{busy ? 'Creating…' : 'Create branch'}</button>
        </form>
        {error && <div className="error-box">{error}</div>}
      </div>
      <div className="panel-card span-two">
        <div className="section-heading"><div><span className="eyebrow">{membership?.tenant?.name || 'Tenant'}</span><h3>Branches</h3></div><span className="count-pill">{branches.length}</span></div>
        <div className="branch-grid">
          {branches.length === 0 && <div className="empty-state">Create the first outlet to begin configuring inventory, staff and menu.</div>}
          {branches.map((branch) => (
            <article className="branch-card" key={branch.id}>
              <div className="branch-card-top"><div className="outlet-icon">{branch.type === 'BAR_RESTAURANT' ? <Wine /> : <Store />}</div><span className="status-pill success">{branch.status}</span></div>
              <h4>{branch.name}</h4><p>{branch.code}</p>
              <div className="branch-type">{branch.type === 'BAR_RESTAURANT' ? 'Bar + Restaurant' : 'Wine Shop'}</div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Dashboard() {
  const { token, session, logout } = useAuth();
  const access = session.access || {};
  const isSuperAdmin = Boolean(access.isSuperAdmin);
  const tenantAdmin = (access.tenants || []).find((m) => m.role === 'TENANT_ADMIN');
  const primaryRole = isSuperAdmin ? 'Super Admin' : tenantAdmin ? 'Tenant Admin' : access.branches?.[0]?.role?.replaceAll('_', ' ') || 'Staff';

  const stats = useMemo(() => [
    { label: 'Tenant access', value: isSuperAdmin ? 'Platform' : String(access.tenants?.length || 0), icon: Building2 },
    { label: 'Assigned branches', value: String(access.branches?.length || 0), icon: Store },
    { label: 'Live access check', value: 'Active', icon: ShieldCheck },
    { label: 'Inventory base', value: 'ML ready', icon: PackageSearch }
  ], [access, isSuperAdmin]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand"><span className="brand-dot" /><div><strong>Outlet</strong><span>Management</span></div></div>
        <nav>
          <button className="nav-item active"><BarChart3 /> Overview</button>
          <button className="nav-item"><Store /> Branches</button>
          <button className="nav-item"><PackageSearch /> Inventory</button>
          <button className="nav-item"><ClipboardList /> Sales & Orders</button>
          <button className="nav-item"><UsersRound /> Staff</button>
        </nav>
        <div className="sidebar-foot"><div className="foundation-tag"><ShieldCheck /> Phase 1 foundation</div></div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div><span className="eyebrow">Operations console</span><h2>Good to see you, {session.user?.name?.split(' ')?.[0] || 'Admin'}</h2></div>
          <div className="profile-chip">{session.user?.avatarUrl ? <img src={session.user.avatarUrl} alt="" /> : <CircleUserRound />}<div><strong>{session.user?.name || session.user?.email}</strong><span>{primaryRole}</span></div><button onClick={logout} title="Sign out"><LogOut size={18} /></button></div>
        </header>

        <section className="stat-grid">
          {stats.map(({ label, value, icon: Icon }) => <article className="stat-card" key={label}><div className="stat-icon"><Icon /></div><div><span>{label}</span><strong>{value}</strong></div></article>)}
        </section>

        {isSuperAdmin && <PlatformTenants token={token} />}
        {!isSuperAdmin && tenantAdmin && <TenantBranches token={token} membership={tenantAdmin} />}
        {!isSuperAdmin && !tenantAdmin && (
          <section className="panel-card wide-card"><span className="eyebrow">Branch workspace</span><h3>Your operational workspace is connected</h3><p className="muted">Inventory, POS and waiter-specific screens will be added in the next domain phase. Your branch visibility is already enforced by live server-side membership checks.</p></section>
        )}
      </main>
    </div>
  );
}

export default function App() {
  const { session, loading } = useAuth();
  if (loading) return <main className="center-page"><div className="loading-orb"><RefreshCw /></div></main>;
  if (!session) return <LoginScreen />;
  if (session.pendingApproval || !session.access?.approved) return <PendingScreen />;
  return <Dashboard />;
}
