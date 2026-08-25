import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import {
  Activity,
  BarChart3,
  Building2,
  CheckCircle2,
  ChevronRight,
  CircleUserRound,
  ClipboardList,
  LogOut,
  Menu,
  PackageSearch,
  Plus,
  RefreshCw,
  ShieldCheck,
  Store,
  UsersRound,
  Wine,
  X
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
        <div className="login-brand-row">
          <div className="brand-mark"><Wine size={23} /></div>
          <div className="login-brand-copy"><strong>Outlet Management</strong><span>Hospitality operations platform</span></div>
        </div>
        <div className="login-copy">
          <span className="eyebrow light">Multi-outlet operations</span>
          <h1>Every outlet.<br />Every pour.<br />One control desk.</h1>
          <p>Run inventory, restaurant operations, wine-shop sales and staff access from one branch-aware management system.</p>
        </div>
        <div className="feature-strip">
          <span><CheckCircle2 size={16} /> ML-based alcohol stock</span>
          <span><CheckCircle2 size={16} /> Branch-level controls</span>
          <span><CheckCircle2 size={16} /> Management reporting</span>
        </div>
      </section>

      <section className="login-panel-wrap">
        <div className="login-panel">
          <div className="mini-brand"><span className="brand-dot" /> Secure operations access</div>
          <span className="eyebrow">Welcome</span>
          <h2>Sign in to your workspace</h2>
          <p className="muted">Use the Google account assigned by your platform or tenant administrator.</p>
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
          <div className="security-note"><ShieldCheck size={18} /><span>Google verifies identity first. The backend then checks live tenant and branch permissions before allowing access.</span></div>
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
        <div className="status-icon"><ShieldCheck size={28} /></div>
        <span className="eyebrow">Identity verified</span>
        <h1>Waiting for access assignment</h1>
        <p>Your account <strong>{session?.user?.email}</strong> is verified, but no tenant or branch role has been assigned yet.</p>
        <p className="muted">Once an administrator assigns your role, the same login will unlock your authorised workspace.</p>
        {message && <div className="info-box">{message}</div>}
        <div className="button-row">
          <button className="primary-btn" onClick={checkAgain} disabled={busy}><RefreshCw size={16} /> {busy ? 'Checking…' : 'Check approval'}</button>
          <button className="ghost-btn" onClick={logout}><LogOut size={16} /> Sign out</button>
        </div>
      </section>
    </main>
  );
}

function PlatformTenants({ token, formRef }) {
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
    <section className="content-section">
      <div className="section-bar">
        <div><span className="section-kicker">Platform administration</span><h3>Tenant management</h3></div>
        <div className="section-count"><Building2 size={15} /> {tenants.length} tenants</div>
      </div>
      <div className="platform-layout">
        <form className="create-panel" onSubmit={createTenant} ref={formRef}>
          <div className="panel-heading">
            <div className="panel-icon"><Plus size={17} /></div>
            <div><span>Super Admin</span><h4>Create tenant</h4></div>
          </div>
          <label>Business / group name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sunrise Hospitality" required /></label>
          <label>First Tenant Admin email<input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="owner@example.com" /></label>
          <button className="primary-btn full" disabled={busy}>{busy ? 'Creating…' : 'Create tenant'} <ChevronRight size={16} /></button>
          {error && <div className="error-box">{error}</div>}
        </form>

        <div className="management-list">
          <div className="list-head"><span>Business</span><span>Status</span></div>
          {tenants.length === 0 && (
            <div className="empty-state compact"><Building2 size={25} /><strong>No tenants created yet</strong><span>Create the first business group to begin adding outlets and administrators.</span></div>
          )}
          {tenants.map((tenant) => (
            <div className="management-row" key={tenant.id}>
              <div className="entity-main"><div className="tenant-avatar">{tenant.name.slice(0, 2).toUpperCase()}</div><div><strong>{tenant.name}</strong><span>{tenant.slug}</span></div></div>
              <span className={`status-pill ${tenant.status === 'ACTIVE' ? 'success' : ''}`}>{tenant.status}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TenantBranches({ token, membership, formRef }) {
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
    <section className="content-section">
      <div className="section-bar">
        <div><span className="section-kicker">{membership?.tenant?.name || 'Tenant workspace'}</span><h3>Branch management</h3></div>
        <div className="section-count"><Store size={15} /> {branches.length} outlets</div>
      </div>
      <div className="platform-layout">
        <form className="create-panel" onSubmit={createBranch} ref={formRef}>
          <div className="panel-heading"><div className="panel-icon"><Plus size={17} /></div><div><span>Tenant Admin</span><h4>Add outlet</h4></div></div>
          <label>Branch name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Central Bar & Kitchen" required /></label>
          <label>Branch code<input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="CBK-01" required /></label>
          <label>Outlet type<select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option value="BAR_RESTAURANT">Bar + Restaurant</option><option value="WINE_SHOP">Wine Shop</option></select></label>
          <button className="primary-btn full" disabled={busy}>{busy ? 'Creating…' : 'Create outlet'} <ChevronRight size={16} /></button>
          {error && <div className="error-box">{error}</div>}
        </form>
        <div className="branch-list-wrap">
          {branches.length === 0 && <div className="empty-state"><Store size={28} /><strong>No outlets configured</strong><span>Create the first branch to begin inventory and staff setup.</span></div>}
          <div className="branch-grid">
            {branches.map((branch) => (
              <article className="branch-card" key={branch.id}>
                <div className="branch-card-top"><div className="outlet-icon">{branch.type === 'BAR_RESTAURANT' ? <Wine /> : <Store />}</div><span className="status-pill success">{branch.status}</span></div>
                <h4>{branch.name}</h4><p>{branch.code}</p>
                <div className="branch-footer"><span>{branch.type === 'BAR_RESTAURANT' ? 'Bar + Restaurant' : 'Wine Shop'}</span><ChevronRight size={15} /></div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function PhasePanel({ activeSection }) {
  const copy = {
    Branches: ['Branch operations', 'Outlet configuration and branch-level access are being expanded from the foundation already in place.'],
    Inventory: ['Inventory workspace', 'ML-based alcohol stock, purchase batches, adjustments and stock movement controls are the next implementation phase.'],
    'Sales & Orders': ['Sales & orders', 'Wine-shop POS and restaurant order workflows will plug into the inventory ledger once the stock engine is complete.'],
    Staff: ['Staff & access', 'Branch membership is enforced by the backend today. The full staff management screen is the next UI layer.']
  };
  const [title, body] = copy[activeSection] || copy.Inventory;
  return (
    <section className="content-section phase-panel">
      <div className="phase-illustration"><Activity size={28} /></div>
      <span className="section-kicker">Product roadmap</span>
      <h3>{title}</h3>
      <p>{body}</p>
      <div className="phase-tag"><ShieldCheck size={15} /> Access controls are already enforced server-side</div>
    </section>
  );
}

function Dashboard() {
  const { token, session, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('Overview');
  const actionRef = useRef(null);
  const access = session.access || {};
  const isSuperAdmin = Boolean(access.isSuperAdmin);
  const tenantAdmin = (access.tenants || []).find((m) => m.role === 'TENANT_ADMIN');
  const primaryRole = isSuperAdmin ? 'Super Admin' : tenantAdmin ? 'Tenant Admin' : access.branches?.[0]?.role?.replaceAll('_', ' ') || 'Staff';

  const navItems = [
    { label: 'Overview', icon: BarChart3 },
    { label: 'Branches', icon: Store },
    { label: 'Inventory', icon: PackageSearch },
    { label: 'Sales & Orders', icon: ClipboardList },
    { label: 'Staff', icon: UsersRound }
  ];

  const stats = useMemo(() => [
    { label: 'Workspace access', value: isSuperAdmin ? 'Platform' : `${access.tenants?.length || 0} tenant`, icon: Building2, hint: isSuperAdmin ? 'All tenant operations' : 'Assigned business access' },
    { label: 'Assigned branches', value: String(access.branches?.length || 0), icon: Store, hint: 'Live branch memberships' },
    { label: 'Access status', value: 'Active', icon: ShieldCheck, hint: 'Checked on every request' },
    { label: 'Inventory model', value: 'ML ready', icon: PackageSearch, hint: 'Bottle + pour foundation' }
  ], [access, isSuperAdmin]);

  function chooseSection(label) {
    setActiveSection(label);
    setMobileMenuOpen(false);
  }

  function primaryAction() {
    setActiveSection('Overview');
    setMobileMenuOpen(false);
    setTimeout(() => actionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 40);
  }

  const navigation = (
    <>
      <div className="nav-label">Workspace</div>
      {navItems.map(({ label, icon: Icon }) => (
        <button key={label} type="button" className={`nav-item ${activeSection === label ? 'active' : ''}`} onClick={() => chooseSection(label)}>
          <Icon size={18} /><span>{label}</span>{activeSection === label && <span className="nav-marker" />}
        </button>
      ))}
    </>
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand"><span className="brand-box"><Wine size={18} /></span><div><strong>Outlet</strong><span>Management System</span></div></div>
        <nav>{navigation}</nav>
        <div className="sidebar-foot">
          <div className="workspace-badge"><ShieldCheck size={16} /><div><strong>Secure workspace</strong><span>Live permission checks</span></div></div>
          <button className="sidebar-logout" onClick={logout}><LogOut size={17} /> Sign out</button>
        </div>
      </aside>

      <div className="mobilebar">
        <div className="mobile-brand"><span className="brand-box"><Wine size={17} /></span><div><strong>Outlet</strong><span>Management</span></div></div>
        <button className="mobile-menu-button" onClick={() => setMobileMenuOpen((open) => !open)} aria-label="Toggle navigation">{mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}</button>
      </div>
      {mobileMenuOpen && <button className="drawer-backdrop" aria-label="Close navigation" onClick={() => setMobileMenuOpen(false)} />}
      <div className={`mobile-drawer ${mobileMenuOpen ? 'open' : ''}`}>
        <nav>{navigation}</nav>
        <div className="mobile-drawer-user"><CircleUserRound size={22} /><div><strong>{session.user?.name || session.user?.email}</strong><span>{primaryRole}</span></div></div>
        <button className="sidebar-logout" onClick={logout}><LogOut size={17} /> Sign out</button>
      </div>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-copy"><span className="eyebrow">Operations console</span><h2>{activeSection}</h2></div>
          <div className="profile-chip">{session.user?.avatarUrl ? <img src={session.user.avatarUrl} alt="" /> : <CircleUserRound />}<div><strong>{session.user?.name || session.user?.email}</strong><span>{primaryRole}</span></div><button onClick={logout} title="Sign out"><LogOut size={17} /></button></div>
        </header>

        {activeSection === 'Overview' ? (
          <>
            <section className="dashboard-hero">
              <div className="hero-copy">
                <span className="hero-kicker">{isSuperAdmin ? 'Platform control' : tenantAdmin?.tenant?.name || 'Branch operations'}</span>
                <h1>Good to see you, {session.user?.name?.split(' ')?.[0] || 'Admin'}.</h1>
                <p>{isSuperAdmin ? 'Create business groups, assign tenant ownership and keep every outlet under one governed platform.' : 'Manage the outlets and operational access assigned to your business workspace.'}</p>
              </div>
              {(isSuperAdmin || tenantAdmin) && <button className="hero-action" onClick={primaryAction}><Plus size={17} /> {isSuperAdmin ? 'Create tenant' : 'Add outlet'}</button>}
            </section>

            <section className="stat-grid" aria-label="Workspace overview">
              {stats.map(({ label, value, icon: Icon, hint }) => <article className="stat-card" key={label}><div className="stat-top"><div className="stat-icon"><Icon /></div><span className="status-dot" /></div><strong>{value}</strong><span>{label}</span><small>{hint}</small></article>)}
            </section>

            {isSuperAdmin && <PlatformTenants token={token} formRef={actionRef} />}
            {!isSuperAdmin && tenantAdmin && <TenantBranches token={token} membership={tenantAdmin} formRef={actionRef} />}
            {!isSuperAdmin && !tenantAdmin && <PhasePanel activeSection="Branches" />}
          </>
        ) : (
          <PhasePanel activeSection={activeSection} />
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
