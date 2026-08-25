import React, { useEffect, useMemo, useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import {
  Activity,
  BarChart3,
  Building2,
  ChevronRight,
  ClipboardList,
  Layers3,
  LogOut,
  Menu,
  Moon,
  PackageSearch,
  Plus,
  RefreshCw,
  ShieldCheck,
  Store,
  Sun,
  UsersRound,
  UtensilsCrossed,
  Wine,
  X
} from 'lucide-react';
import { useAuth } from './AuthContext';
import { api, apiErrorMessage, authHeaders } from './api';
import InventoryWorkspace from './InventoryWorkspace';
import SalesWorkspace from './SalesWorkspace';
import RestaurantWorkspace from './RestaurantWorkspace';
import StaffWorkspace from './StaffWorkspace';
import AnalyticsWorkspace from './AnalyticsWorkspace';

const THEME_KEY = 'managementSystemTheme';

function readTheme() {
  try {
    return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
  } catch (_) {
    return 'dark';
  }
}

function usePlatformTheme() {
  const [theme, setTheme] = useState(readTheme);
  useEffect(() => {
    try { localStorage.setItem(THEME_KEY, theme); } catch (_) {}
  }, [theme]);
  return [theme, () => setTheme((current) => current === 'light' ? 'dark' : 'light')];
}

function ThemeToggle({ theme, onToggle, auth = false }) {
  const light = theme === 'light';
  const Icon = light ? Moon : Sun;
  return (
    <button type="button" onClick={onToggle} className={auth ? 'sa-theme-toggle' : 'scorm-theme-toggle'} aria-label={light ? 'Switch to dark theme' : 'Switch to light theme'} title={light ? 'Switch to dark theme' : 'Switch to light theme'}>
      <Icon size={15} strokeWidth={2} /><span>{light ? 'Dark' : 'Light'}</span><span className="theme-toggle-track" aria-hidden="true"><span className="theme-toggle-knob" /></span>
    </button>
  );
}

function getGoogleButtonWidth() {
  if (typeof window === 'undefined') return 400;
  return Math.max(220, Math.min(400, window.innerWidth - 82));
}

function LoginScreen() {
  const { loginWithGoogle } = useAuth();
  const [theme, toggleTheme] = usePlatformTheme();
  const [googleButtonWidth, setGoogleButtonWidth] = useState(getGoogleButtonWidth);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { const update = () => setGoogleButtonWidth(getGoogleButtonWidth()); window.addEventListener('resize', update); return () => window.removeEventListener('resize', update); }, []);
  async function handleCredential(response) {
    if (!response?.credential) { setError('Google Sign-In did not return a valid credential.'); return; }
    try { setBusy(true); setError(''); await loginWithGoogle(response.credential); }
    catch (err) { setError(apiErrorMessage(err)); }
    finally { setBusy(false); }
  }
  return <div className={`scorm-auth-workbench scorm-theme-${theme}`}><div className="sa-shell"><div className="sa-topbar"><div className="sa-top-note">Outlet Management Platform · Multi-outlet operations</div><div className="sa-top-actions"><div className="sa-top-note">Role-based access · Live server permission checks</div><ThemeToggle theme={theme} onToggle={toggleTheme} auth /></div></div><main className="sa-card auth-enter"><section className="sa-brand-panel"><div className="sa-mark"><Layers3 size={22} /></div><div className="sa-kicker">Inventory · sales · restaurants · staff</div><h1 className="sa-title">OUTLET <span>OS</span></h1><p className="sa-copy">One workspace for multi-outlet inventory, bar and restaurant operations, wine-shop sales, staff accountability and management reporting.</p><div className="sa-points"><div className="sa-point"><span className="sa-point-dot" /> ML-based alcohol inventory and bottle-level control</div><div className="sa-point"><span className="sa-point-dot" /> Tenant, branch and staff permissions checked live</div><div className="sa-point"><span className="sa-point-dot" /> Restaurant, wine-shop and reporting workflows in one console</div></div><div className="sa-notice"><div className="sa-notice-title"><ShieldCheck size={14} /> Secure by design</div><div>Google verifies the identity. The backend then resolves the current tenant, branch and role before protected data is returned.</div></div></section><section className="sa-form-panel"><div className="sa-form-kicker">Platform access</div><h2 className="sa-form-title">Sign in to Outlet OS</h2><p className="sa-form-sub">Continue with the Google account assigned by your platform or tenant administrator.</p><div className="sa-tabs"><button type="button" className="sa-tab is-active">Google sign in</button><button type="button" className="sa-tab" disabled>Managed access</button></div>{error && <div className="sa-error">{error}</div>}<div className={busy ? 'sa-google-block is-busy' : 'sa-google-block'}><div className="sa-google-label"><ShieldCheck size={13} /> Google account</div><div className="sa-google-button"><GoogleLogin onSuccess={handleCredential} onError={() => setError('Google Sign-In failed. Please try again.')} theme="outline" size="large" shape="rectangular" text="continue_with" width={String(googleButtonWidth)} /></div><div className="sa-google-hint">New identities are captured as pending until an administrator assigns platform, tenant or branch access.</div></div><div className="sa-divider"><span>access model</span></div><div className="sa-access-grid"><div><Building2 size={16} /><strong>Super Admin</strong><span>Creates tenants and platform access.</span></div><div><Store size={16} /><strong>Tenant Admin</strong><span>Creates outlets and assigns staff.</span></div><div><UsersRound size={16} /><strong>Branch Staff</strong><span>Works only inside assigned outlets.</span></div></div></section></main></div></div>;
}

function PendingScreen() {
  const { session, refresh, logout } = useAuth();
  const [theme, toggleTheme] = usePlatformTheme();
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  async function checkAgain(){try{setBusy(true);setMessage('');const next=await refresh();if(next?.pendingApproval)setMessage('Approval is still pending.');}catch(error){setMessage(apiErrorMessage(error));}finally{setBusy(false);}}
  return <div className={`scorm-auth-workbench scorm-theme-${theme}`}><div className="sa-shell pending-shell"><div className="sa-topbar"><div className="sa-top-note">Outlet Management Platform</div><ThemeToggle theme={theme} onToggle={toggleTheme} auth /></div><main className="pending-card auth-enter"><div className="pending-mark"><ShieldCheck size={26} /></div><div className="sa-kicker">Identity verified</div><h1>Waiting for access assignment</h1><p>Your account <strong>{session?.user?.email}</strong> is verified, but it does not yet have an active tenant or branch role.</p><p>Once an administrator assigns access, the same Google login will open the authorised workspace automatically.</p>{message&&<div className="sa-notice pending-message">{message}</div>}<div className="pending-actions"><button className="scorm-button-primary" onClick={checkAgain} disabled={busy}><RefreshCw size={15} className={busy?'spin':''}/>{busy?'Checking…':'Refresh access'}</button><button className="scorm-button-secondary" onClick={logout}><LogOut size={15}/>Sign out</button></div></main></div></div>;
}

function SectionHeader({ eyebrow, title, count, icon: Icon }) { return <div className="scorm-panel-header ops-panel-header"><div><div className="scorm-eyebrow">{eyebrow}</div><h3>{title}</h3></div>{count!==undefined&&<div className="ops-count">{Icon&&<Icon size={13}/>} {count}</div>}</div>; }

function PlatformTenants({ token }) {
  const [tenants,setTenants]=useState([]);const [name,setName]=useState('');const [adminEmail,setAdminEmail]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  async function load(){try{const{data}=await api.get('/platform/tenants',{headers:authHeaders(token)});setTenants(data.tenants||[]);}catch(err){setError(apiErrorMessage(err));}}
  useEffect(()=>{load();},[]);
  async function createTenant(event){event.preventDefault();try{setBusy(true);setError('');await api.post('/platform/tenants',{name,tenantAdminEmail:adminEmail},{headers:authHeaders(token)});setName('');setAdminEmail('');await load();}catch(err){setError(apiErrorMessage(err));}finally{setBusy(false);}}
  return <section className="scorm-panel ops-management-panel"><SectionHeader eyebrow="Platform administration" title="Tenant management" count={`${tenants.length} tenants`} icon={Building2}/><div className="ops-admin-grid"><form className="ops-form" onSubmit={createTenant}><div className="ops-form-heading"><div className="scorm-action-icon"><Plus size={17}/></div><div><div className="scorm-eyebrow">Super Admin</div><h4>Create tenant</h4></div></div><label>Business / group name<input value={name} onChange={(e)=>setName(e.target.value)} placeholder="e.g. Sunrise Hospitality" required/></label><label>First Tenant Admin email<input type="email" value={adminEmail} onChange={(e)=>setAdminEmail(e.target.value)} placeholder="owner@example.com"/></label><button className="scorm-button-primary ops-submit" disabled={busy}>{busy?'Creating…':'Create tenant'}<ChevronRight size={15}/></button>{error&&<div className="ops-error">{error}</div>}</form><div className="ops-list"><div className="ops-list-head"><span>Business</span><span>Status</span></div>{tenants.length===0&&<div className="ops-empty"><div className="scorm-empty-icon"><Building2 size={18}/></div><strong>No tenants yet</strong><span>Create the first business group to begin outlet setup.</span></div>}{tenants.map((tenant)=><div className="ops-row" key={tenant.id}><div className="ops-entity"><div className="ops-avatar">{tenant.name.slice(0,2).toUpperCase()}</div><div><strong>{tenant.name}</strong><span>{tenant.slug}</span></div></div><span className={`ops-status ${tenant.status==='ACTIVE'?'is-active':''}`}>{tenant.status}</span></div>)}</div></div></section>;
}

function TenantBranches({ token, membership }) {
  const tenantId=membership?.tenantId;const[branches,setBranches]=useState([]);const[form,setForm]=useState({name:'',code:'',type:'BAR_RESTAURANT'});const[error,setError]=useState('');const[busy,setBusy]=useState(false);
  async function load(){if(!tenantId)return;try{const{data}=await api.get(`/tenants/${tenantId}/branches`,{headers:authHeaders(token)});setBranches(data.branches||[]);}catch(err){setError(apiErrorMessage(err));}}
  useEffect(()=>{load();},[tenantId]);
  async function createBranch(event){event.preventDefault();try{setBusy(true);setError('');await api.post(`/tenants/${tenantId}/branches`,form,{headers:authHeaders(token)});setForm({name:'',code:'',type:'BAR_RESTAURANT'});await load();}catch(err){setError(apiErrorMessage(err));}finally{setBusy(false);}}
  return <section className="scorm-panel ops-management-panel"><SectionHeader eyebrow={membership?.tenant?.name||'Tenant workspace'} title="Branch management" count={`${branches.length} outlets`} icon={Store}/><div className="ops-admin-grid"><form className="ops-form" onSubmit={createBranch}><div className="ops-form-heading"><div className="scorm-action-icon"><Plus size={17}/></div><div><div className="scorm-eyebrow">Tenant Admin</div><h4>Add outlet</h4></div></div><label>Branch name<input value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})} placeholder="Central Bar & Kitchen" required/></label><label>Branch code<input value={form.code} onChange={(e)=>setForm({...form,code:e.target.value})} placeholder="CBK-01" required/></label><label>Outlet type<select value={form.type} onChange={(e)=>setForm({...form,type:e.target.value})}><option value="BAR_RESTAURANT">Bar + Restaurant</option><option value="WINE_SHOP">Wine Shop</option></select></label><button className="scorm-button-primary ops-submit" disabled={busy}>{busy?'Creating…':'Create outlet'}<ChevronRight size={15}/></button>{error&&<div className="ops-error">{error}</div>}</form><div className="ops-list"><div className="ops-list-head"><span>Outlet</span><span>Status</span></div>{branches.length===0&&<div className="ops-empty"><div className="scorm-empty-icon"><Store size={18}/></div><strong>No outlets configured</strong><span>Create the first branch to begin inventory and staff setup.</span></div>}{branches.map((branch)=><div className="ops-row" key={branch.id}><div className="ops-entity"><div className="ops-avatar">{branch.type==='BAR_RESTAURANT'?<Wine size={16}/>:<Store size={16}/>}</div><div><strong>{branch.name}</strong><span>{branch.code} · {branch.type==='BAR_RESTAURANT'?'Bar + Restaurant':'Wine Shop'}</span></div></div><span className="ops-status is-active">{branch.status}</span></div>)}</div></div></section>;
}

function RoadmapPanel(){return <section className="scorm-panel roadmap-panel"><div className="scorm-action-icon"><Activity size={18}/></div><div className="scorm-eyebrow">Workspace</div><h3>Branch operations</h3><p>Outlet configuration, branch controls and branch-level activity are managed from this workspace.</p><div className="roadmap-note"><ShieldCheck size={14}/>Live backend permission checks are active.</div></section>;}
function MetricCard({label,value,icon:Icon,tone='orange'}){return <div className={`scorm-metric-card scorm-metric-${tone}`}><div className="metric-inner"><div><div className="scorm-metric-value">{value}</div><div className="scorm-metric-label">{label}</div></div><div className="scorm-metric-icon"><Icon size={17}/></div></div></div>;}

function Overview({token,access,isSuperAdmin,tenantAdmin,primaryRole,onOpenSection}){
  const stats=useMemo(()=>[{label:'Workspace',value:isSuperAdmin?'Platform':tenantAdmin?'Tenant':'Branch',icon:Building2},{label:'Assigned branches',value:String(access.branches?.length||0),icon:Store},{label:'Live access',value:'Active',icon:ShieldCheck},{label:'Inventory base',value:'ML',icon:PackageSearch},{label:'Current role',value:primaryRole,icon:UsersRound}],[access,isSuperAdmin,tenantAdmin,primaryRole]);
  return <div className="platform-page"><section className="scorm-page-hero"><div className="page-hero-row"><div className="page-hero-copy"><div className="hero-meta-row"><span className="scorm-eyebrow">Operate · control · reconcile · report</span><span className="scorm-health-pill is-online"><span className="scorm-health-dot"/>Operations online</span></div><h2 className="scorm-display"><span>Operations</span> <span className="wb-accent">Workbench</span></h2><p>Manage outlets, staff, inventory, sales, restaurant service and management analytics from one branch-aware operating view.</p></div><div className="hero-actions"><button className="scorm-button-secondary" onClick={()=>onOpenSection('Analytics')}><BarChart3 size={15}/>Analytics</button><button className="scorm-button-primary" onClick={()=>onOpenSection(isSuperAdmin?'Tenants':'Branches')}><Plus size={15}/>{isSuperAdmin?'Create tenant':'Add outlet'}</button></div></div></section><div className="metric-grid">{stats.map((stat)=><MetricCard key={stat.label}{...stat}/>)}</div><div className="overview-grid"><div>{isSuperAdmin&&<PlatformTenants token={token}/>} {!isSuperAdmin&&tenantAdmin&&<TenantBranches token={token} membership={tenantAdmin}/>} {!isSuperAdmin&&!tenantAdmin&&<RoadmapPanel/>}</div><div className="overview-side"><section className="scorm-progress-hero"><div className="progress-hero-top"><div><div className="scorm-progress-kicker">System foundation</div><h3>Operations readiness</h3></div><div className="scorm-progress-icon"><Activity size={18}/></div></div><div><div className="scorm-progress-number">Phase 5</div><div className="progress-copy">Inventory, counter POS, restaurant operations and staff access are live. Consolidated tenant/branch analytics now include revenue, COGS, gross profit, expenses, operating P&amp;L, stock and waiter accountability.</div><div className="scorm-progress-track is-dark"><div className="scorm-progress-fill" style={{width:'79%'}}/></div></div></section><section className="scorm-panel quick-panel"><SectionHeader eyebrow="Workspace" title="Quick access"/><div className="quick-list"><button onClick={()=>onOpenSection('Inventory')}><PackageSearch size={15}/><span><strong>Inventory</strong><small>ML stock and purchases</small></span><ChevronRight size={14}/></button><button onClick={()=>onOpenSection('Sales & Orders')}><ClipboardList size={15}/><span><strong>Sales & Orders</strong><small>Counter POS and settlements</small></span><ChevronRight size={14}/></button><button onClick={()=>onOpenSection('Restaurant')}><UtensilsCrossed size={15}/><span><strong>Restaurant</strong><small>Tables, QR menu and waiter service</small></span><ChevronRight size={14}/></button><button onClick={()=>onOpenSection('Analytics')}><BarChart3 size={15}/><span><strong>Analytics & P&amp;L</strong><small>Revenue, margin and controls</small></span><ChevronRight size={14}/></button></div></section></div></div><div className="action-grid"><button className="scorm-action-card" onClick={()=>onOpenSection('Inventory')}><div className="scorm-action-icon"><PackageSearch size={17}/></div><div className="action-title">Inventory</div><div className="action-copy">Track bottles, pours, purchases, adjustments and branch stock from one ledger-backed view.</div><div className="scorm-action-arrow"><ChevronRight size={15}/></div></button><button className="scorm-action-card" onClick={()=>onOpenSection('Restaurant')}><div className="scorm-action-icon"><UtensilsCrossed size={17}/></div><div className="action-title">Restaurant</div><div className="action-copy">Operate tables, waiter orders, public QR menus and unresolved-order reconciliation.</div><div className="scorm-action-arrow"><ChevronRight size={15}/></div></button><button className="scorm-action-card" onClick={()=>onOpenSection('Analytics')}><div className="scorm-action-icon"><BarChart3 size={17}/></div><div className="action-title">Analytics & P&amp;L</div><div className="action-copy">Compare branches, analyse product mix, track margins, expenses, stock risk and unresolved orders.</div><div className="scorm-action-arrow"><ChevronRight size={15}/></div></button></div></div>;
}

function Dashboard(){
  const{token,session,logout}=useAuth();const[theme,toggleTheme]=usePlatformTheme();const[mobileOpen,setMobileOpen]=useState(false);const[activeSection,setActiveSection]=useState('Overview');const access=session?.access||{};const isSuperAdmin=Boolean(access.isSuperAdmin);const tenantAdmin=(access.tenants||[]).find((membership)=>membership.role==='TENANT_ADMIN');const primaryRole=isSuperAdmin?'Super Admin':tenantAdmin?'Tenant Admin':access.branches?.[0]?.role?.replaceAll('_',' ')||'Staff';
  const groups=useMemo(()=>{const platform=[{label:'Overview',icon:BarChart3},...(isSuperAdmin?[{label:'Tenants',icon:Building2}]:[]),{label:'Branches',icon:Store}];return[{label:'Platform',items:platform},{label:'Operations',items:[{label:'Inventory',icon:PackageSearch},{label:'Sales & Orders',icon:ClipboardList},{label:'Restaurant',icon:UtensilsCrossed},{label:'Analytics',icon:BarChart3},{label:'Staff',icon:UsersRound}]}];},[isSuperAdmin]);
  function openSection(section){setActiveSection(section);setMobileOpen(false);}
  function Navigation(){return <nav className="scorm-nav">{groups.map((group,index)=><div className={index?'nav-group nav-group-spaced':'nav-group'} key={group.label}><div className="scorm-nav-section">{group.label}</div><div className="nav-items">{group.items.map(({label,icon:Icon})=>{const active=activeSection===label;return <button key={label} type="button" className={`scorm-nav-item ${active?'scorm-nav-active':''}`} onClick={()=>openSection(label)}><span className="scorm-nav-icon"><Icon size={16} strokeWidth={active?2.2:1.9}/></span><span>{label}</span>{active&&<ChevronRight size={14} className="scorm-nav-chevron"/>}</button>})}</div></div>)}</nav>}
  function Brand(){return <button type="button" className="scorm-brand" onClick={()=>openSection('Overview')}><span className="scorm-brand-mark"><Layers3 size={19}/></span><span className="brand-copy"><strong className="scorm-brand-name">OUTLET <em>OS</em></strong><small>Hospitality operations platform</small></span></button>}
  return <div className={`scorm-editorial scorm-theme-${theme}`}><aside className="scorm-sidebar"><div className="scorm-brand-wrap"><Brand/></div><Navigation/><div className="scorm-sidebar-footer"><div className="scorm-status-card"><div className="status-title"><span className="scorm-status-dot"/>{primaryRole}</div><div className="status-copy">{session?.user?.email}</div></div><button type="button" onClick={logout} className="scorm-sidebar-switch"><span><LogOut size={14}/>Sign out</span><ChevronRight size={13}/></button></div></aside>{mobileOpen&&<div className="mobile-overlay"><button aria-label="Close navigation" className="mobile-backdrop" onClick={()=>setMobileOpen(false)}/><div className="scorm-mobile-drawer"><div className="drawer-head"><Brand/><button className="scorm-drawer-close" onClick={()=>setMobileOpen(false)}><X size={17}/></button></div><Navigation/><div className="drawer-foot"><button type="button" onClick={logout} className="scorm-sidebar-switch"><span><LogOut size={14}/>Sign out</span><ChevronRight size={13}/></button></div></div></div>}<div className="scorm-shell-content"><header className="scorm-topbar"><button type="button" onClick={()=>setMobileOpen(true)} className="scorm-topbar-icon mobile-menu-trigger" aria-label="Open navigation"><Menu size={18}/></button><div className="topbar-context"><ShieldCheck size={12}/>Live access · {primaryRole}</div><div className="topbar-actions"><ThemeToggle theme={theme} onToggle={toggleTheme}/><button className="scorm-button-secondary topbar-secondary" onClick={()=>openSection('Analytics')}><BarChart3 size={14}/>Analytics</button><button className="scorm-button-primary" onClick={()=>openSection(isSuperAdmin?'Tenants':'Branches')}><Plus size={14}/><span>{isSuperAdmin?'Create tenant':'Add outlet'}</span></button></div></header><main className="scorm-main">{activeSection==='Overview'&&<Overview token={token} access={access} isSuperAdmin={isSuperAdmin} tenantAdmin={tenantAdmin} primaryRole={primaryRole} onOpenSection={openSection}/>} {activeSection==='Tenants'&&isSuperAdmin&&<div className="platform-page standalone-page"><PlatformTenants token={token}/></div>} {activeSection==='Branches'&&tenantAdmin&&<div className="platform-page standalone-page"><TenantBranches token={token} membership={tenantAdmin}/></div>} {activeSection==='Branches'&&!tenantAdmin&&<div className="platform-page standalone-page"><RoadmapPanel/></div>} {activeSection==='Inventory'&&<InventoryWorkspace token={token} access={access}/>} {activeSection==='Sales & Orders'&&<SalesWorkspace token={token} access={access}/>} {activeSection==='Restaurant'&&<RestaurantWorkspace token={token} access={access}/>} {activeSection==='Analytics'&&<AnalyticsWorkspace token={token} access={access}/>} {activeSection==='Staff'&&<StaffWorkspace token={token} access={access}/>}</main></div><div className="scorm-mobile-tabbar">{[{label:'Overview',icon:BarChart3},{label:'Inventory',icon:PackageSearch},{label:'Sales & Orders',short:'Sales',icon:ClipboardList},{label:'Restaurant',short:'Tables',icon:UtensilsCrossed}].map(({label,short,icon:Icon})=><button key={label} className={`scorm-mobile-tab ${activeSection===label?'is-active':''}`} onClick={()=>openSection(label)}><Icon size={17}/><span>{short||label}</span></button>)}</div></div>;
}

export default function App(){const{session,loading}=useAuth();if(loading)return <div className="app-loading"><RefreshCw size={23} className="spin"/></div>;if(!session)return <LoginScreen/>;if(session.pendingApproval||!session.access?.approved)return <PendingScreen/>;return <Dashboard/>;}
