import React, { useEffect, useMemo, useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import {
  Activity, BarChart3, Building2, ChevronRight, ClipboardList, FileText, Layers3, LogOut,
  Menu, Moon, PackageSearch, Plus, RefreshCw, ShieldCheck, Store, Sun, UsersRound,
  UtensilsCrossed, Wine, X
} from 'lucide-react';
import { useAuth } from './AuthContext';
import { api, apiErrorMessage, authHeaders } from './api';
import { LanguageSwitcher, useLanguage } from './LanguageContext';
import InventoryWorkspace from './InventoryWorkspace';
import SalesWorkspace from './SalesWorkspace';
import RestaurantWorkspace from './RestaurantWorkspace';
import StaffWorkspace from './StaffWorkspace';
import AnalyticsWorkspace from './AnalyticsWorkspace';
import ReportsWorkspace from './ReportsWorkspace';

const THEME_KEY = 'managementSystemTheme';
const SECTION_KEYS = {
  Overview: 'nav.overview', Tenants: 'nav.tenants', Branches: 'nav.branches', Inventory: 'nav.inventory',
  'Sales & Orders': 'nav.sales', Restaurant: 'nav.restaurant', Analytics: 'nav.analytics', Reports: 'nav.reports', Staff: 'nav.staff'
};

function readTheme() {
  try { return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'; }
  catch (_) { return 'dark'; }
}
function usePlatformTheme() {
  const [theme, setTheme] = useState(readTheme);
  useEffect(() => { try { localStorage.setItem(THEME_KEY, theme); } catch (_) {} }, [theme]);
  return [theme, () => setTheme((current) => current === 'light' ? 'dark' : 'light')];
}
function ThemeToggle({ theme, onToggle, auth = false }) {
  const light = theme === 'light'; const Icon = light ? Moon : Sun;
  return <button type="button" onClick={onToggle} className={auth ? 'sa-theme-toggle' : 'scorm-theme-toggle'} aria-label={light ? 'Switch to dark theme' : 'Switch to light theme'} title={light ? 'Switch to dark theme' : 'Switch to light theme'}><Icon size={15}/><span>{light ? 'Dark' : 'Light'}</span><span className="theme-toggle-track"><span className="theme-toggle-knob"/></span></button>;
}
function getGoogleButtonWidth() {
  if (typeof window === 'undefined') return 400;
  return Math.max(220, Math.min(400, window.innerWidth - 82));
}

function LoginScreen() {
  const { loginWithGoogle } = useAuth();
  const { t } = useLanguage();
  const [theme, toggleTheme] = usePlatformTheme();
  const [googleButtonWidth, setGoogleButtonWidth] = useState(getGoogleButtonWidth);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { const update = () => setGoogleButtonWidth(getGoogleButtonWidth()); window.addEventListener('resize', update); return () => window.removeEventListener('resize', update); }, []);
  async function handleCredential(response) {
    if (!response?.credential) return setError('Google Sign-In did not return a valid credential.');
    try { setBusy(true); setError(''); await loginWithGoogle(response.credential); }
    catch (err) { setError(apiErrorMessage(err)); }
    finally { setBusy(false); }
  }
  return <div className={`scorm-auth-workbench scorm-theme-${theme}`}>
    <div className="sa-shell">
      <div className="sa-topbar"><div className="sa-top-note">{t('auth.top')}</div><div className="sa-top-actions"><LanguageSwitcher compact/><div className="sa-top-note">{t('auth.securityTop')}</div><ThemeToggle theme={theme} onToggle={toggleTheme} auth/></div></div>
      <main className="sa-card auth-enter">
        <section className="sa-brand-panel">
          <div className="sa-mark"><Layers3 size={22}/></div><div className="sa-kicker">{t('auth.kicker')}</div><h1 className="sa-title">OUTLET <span>OS</span></h1><p className="sa-copy">{t('auth.copy')}</p>
          <div className="sa-points"><div className="sa-point"><span className="sa-point-dot"/> {t('auth.point1')}</div><div className="sa-point"><span className="sa-point-dot"/> {t('auth.point2')}</div><div className="sa-point"><span className="sa-point-dot"/> {t('auth.point3')}</div></div>
          <div className="sa-notice"><div className="sa-notice-title"><ShieldCheck size={14}/> {t('auth.secureTitle')}</div><div>{t('auth.secureBody')}</div></div>
        </section>
        <section className="sa-form-panel">
          <div className="sa-form-kicker">{t('auth.platformAccess')}</div><h2 className="sa-form-title">{t('auth.signIn')}</h2><p className="sa-form-sub">{t('auth.signInCopy')}</p>
          <div className="sa-tabs"><button type="button" className="sa-tab is-active">{t('auth.google')}</button><button type="button" className="sa-tab" disabled>{t('auth.managed')}</button></div>
          {error && <div className="sa-error">{error}</div>}
          <div className={busy ? 'sa-google-block is-busy' : 'sa-google-block'}><div className="sa-google-label"><ShieldCheck size={13}/> {t('auth.googleAccount')}</div><div className="sa-google-button"><GoogleLogin onSuccess={handleCredential} onError={() => setError('Google Sign-In failed. Please try again.')} theme="outline" size="large" shape="rectangular" text="continue_with" width={String(googleButtonWidth)}/></div><div className="sa-google-hint">{t('auth.pendingHint')}</div></div>
          <div className="sa-divider"><span>{t('auth.accessModel')}</span></div><div className="sa-access-grid"><div><Building2 size={16}/><strong>{t('auth.superAdmin')}</strong><span>{t('auth.superAdminCopy')}</span></div><div><Store size={16}/><strong>{t('auth.tenantAdmin')}</strong><span>{t('auth.tenantAdminCopy')}</span></div><div><UsersRound size={16}/><strong>{t('auth.branchStaff')}</strong><span>{t('auth.branchStaffCopy')}</span></div></div>
        </section>
      </main>
    </div>
  </div>;
}

function PendingScreen() {
  const { session, refresh, logout } = useAuth(); const { t } = useLanguage();
  const [theme, toggleTheme] = usePlatformTheme(); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  async function checkAgain() { try { setBusy(true); setMessage(''); const next = await refresh(); if (next?.pendingApproval) setMessage(t('common.pending')); } catch (error) { setMessage(apiErrorMessage(error)); } finally { setBusy(false); } }
  return <div className={`scorm-auth-workbench scorm-theme-${theme}`}><div className="sa-shell pending-shell"><div className="sa-topbar"><div className="sa-top-note">{t('auth.top')}</div><div className="sa-top-actions"><LanguageSwitcher compact/><ThemeToggle theme={theme} onToggle={toggleTheme} auth/></div></div><main className="pending-card auth-enter"><div className="pending-mark"><ShieldCheck size={26}/></div><div className="sa-kicker">{t('auth.identityVerified')}</div><h1>{t('auth.waiting')}</h1><p><strong>{session?.user?.email}</strong> — {t('auth.waitingCopy')}</p><p>{t('auth.waitingCopy2')}</p>{message && <div className="sa-notice pending-message">{message}</div>}<div className="pending-actions"><button className="scorm-button-primary" onClick={checkAgain} disabled={busy}><RefreshCw size={15} className={busy ? 'spin' : ''}/> {busy ? t('common.loading') : t('auth.refreshAccess')}</button><button className="scorm-button-secondary" onClick={logout}><LogOut size={15}/> {t('common.signOut')}</button></div></main></div></div>;
}

function SectionHeader({ eyebrow, title, count, icon: Icon }) { return <div className="scorm-panel-header ops-panel-header"><div><div className="scorm-eyebrow">{eyebrow}</div><h3>{title}</h3></div>{count !== undefined && <div className="ops-count">{Icon && <Icon size={13}/>} {count}</div>}</div>; }

function PlatformTenants({ token }) {
  const { t } = useLanguage(); const [tenants, setTenants] = useState([]); const [name, setName] = useState(''); const [adminEmail, setAdminEmail] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function load() { try { const { data } = await api.get('/platform/tenants', { headers: authHeaders(token) }); setTenants(data.tenants || []); } catch (err) { setError(apiErrorMessage(err)); } }
  useEffect(() => { load(); }, []);
  async function createTenant(event) { event.preventDefault(); try { setBusy(true); setError(''); await api.post('/platform/tenants', { name, tenantAdminEmail: adminEmail }, { headers: authHeaders(token) }); setName(''); setAdminEmail(''); await load(); } catch (err) { setError(apiErrorMessage(err)); } finally { setBusy(false); } }
  return <section className="scorm-panel ops-management-panel"><SectionHeader eyebrow={t('tenant.platformAdmin')} title={t('tenant.management')} count={`${tenants.length}`} icon={Building2}/><div className="ops-admin-grid"><form className="ops-form" onSubmit={createTenant}><div className="ops-form-heading"><div className="scorm-action-icon"><Plus size={17}/></div><div><div className="scorm-eyebrow">{t('auth.superAdmin')}</div><h4>{t('tenant.create')}</h4></div></div><label>{t('tenant.groupName')}<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sunrise Hospitality" required/></label><label>{t('tenant.firstAdmin')}<input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="owner@example.com"/></label><button className="scorm-button-primary ops-submit" disabled={busy}>{busy ? t('common.loading') : t('tenant.create')}<ChevronRight size={15}/></button>{error && <div className="ops-error">{error}</div>}</form><div className="ops-list"><div className="ops-list-head"><span>{t('common.business')}</span><span>{t('common.status')}</span></div>{!tenants.length && <div className="ops-empty"><div className="scorm-empty-icon"><Building2 size={18}/></div><strong>{t('tenant.noTenants')}</strong><span>{t('tenant.noTenantsCopy')}</span></div>}{tenants.map((tenant) => <div className="ops-row" key={tenant.id}><div className="ops-entity"><div className="ops-avatar">{tenant.name.slice(0,2).toUpperCase()}</div><div><strong>{tenant.name}</strong><span>{tenant.slug}</span></div></div><span className={`ops-status ${tenant.status === 'ACTIVE' ? 'is-active' : ''}`}>{tenant.status}</span></div>)}</div></div></section>;
}

function TenantBranches({ token, membership }) {
  const { t } = useLanguage(); const tenantId = membership?.tenantId; const [branches, setBranches] = useState([]); const [form, setForm] = useState({ name:'', code:'', type:'BAR_RESTAURANT' }); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function load() { if (!tenantId) return; try { const { data } = await api.get(`/tenants/${tenantId}/branches`, { headers: authHeaders(token) }); setBranches(data.branches || []); } catch (err) { setError(apiErrorMessage(err)); } }
  useEffect(() => { load(); }, [tenantId]);
  async function createBranch(event) { event.preventDefault(); try { setBusy(true); setError(''); await api.post(`/tenants/${tenantId}/branches`, form, { headers: authHeaders(token) }); setForm({ name:'', code:'', type:'BAR_RESTAURANT' }); await load(); } catch (err) { setError(apiErrorMessage(err)); } finally { setBusy(false); } }
  return <section className="scorm-panel ops-management-panel"><SectionHeader eyebrow={membership?.tenant?.name || t('auth.tenantAdmin')} title={t('branch.management')} count={`${branches.length}`} icon={Store}/><div className="ops-admin-grid"><form className="ops-form" onSubmit={createBranch}><div className="ops-form-heading"><div className="scorm-action-icon"><Plus size={17}/></div><div><div className="scorm-eyebrow">{t('auth.tenantAdmin')}</div><h4>{t('branch.add')}</h4></div></div><label>{t('branch.name')}<input value={form.name} onChange={(e) => setForm({...form,name:e.target.value})} placeholder="Central Bar & Kitchen" required/></label><label>{t('branch.code')}<input value={form.code} onChange={(e) => setForm({...form,code:e.target.value})} placeholder="CBK-01" required/></label><label>{t('branch.type')}<select value={form.type} onChange={(e) => setForm({...form,type:e.target.value})}><option value="BAR_RESTAURANT">{t('branch.bar')}</option><option value="WINE_SHOP">{t('branch.wineShop')}</option></select></label><button className="scorm-button-primary ops-submit" disabled={busy}>{busy ? t('common.loading') : t('branch.add')}<ChevronRight size={15}/></button>{error && <div className="ops-error">{error}</div>}</form><div className="ops-list"><div className="ops-list-head"><span>{t('common.branch')}</span><span>{t('common.status')}</span></div>{!branches.length && <div className="ops-empty"><div className="scorm-empty-icon"><Store size={18}/></div><strong>{t('branch.noBranches')}</strong><span>{t('branch.noBranchesCopy')}</span></div>}{branches.map((branch) => <div className="ops-row" key={branch.id}><div className="ops-entity"><div className="ops-avatar">{branch.type === 'BAR_RESTAURANT' ? <Wine size={16}/> : <Store size={16}/>}</div><div><strong>{branch.name}</strong><span>{branch.code} · {branch.type === 'BAR_RESTAURANT' ? t('branch.bar') : t('branch.wineShop')}</span></div></div><span className="ops-status is-active">{branch.status}</span></div>)}</div></div></section>;
}

function MetricCard({ label, value, icon: Icon }) { return <div className="scorm-metric-card scorm-metric-orange"><div className="metric-inner"><div><div className="scorm-metric-value">{value}</div><div className="scorm-metric-label">{label}</div></div><div className="scorm-metric-icon"><Icon size={17}/></div></div></div>; }
function Overview({ token, access, isSuperAdmin, tenantAdmin, primaryRole, onOpenSection }) {
  const { t } = useLanguage();
  const stats = useMemo(() => [
    { label:t('overview.workspace'), value:isSuperAdmin ? t('nav.platform') : tenantAdmin ? 'Tenant' : t('common.branch'), icon:Building2 },
    { label:t('overview.assignedBranches'), value:String(access.branches?.length || 0), icon:Store },
    { label:t('overview.liveAccess'), value:t('common.active'), icon:ShieldCheck },
    { label:t('overview.inventoryBase'), value:'ML', icon:PackageSearch },
    { label:t('overview.currentRole'), value:primaryRole, icon:UsersRound }
  ], [access,isSuperAdmin,tenantAdmin,primaryRole,t]);
  return <div className="platform-page"><section className="scorm-page-hero"><div className="page-hero-row"><div className="page-hero-copy"><div className="hero-meta-row"><span className="scorm-eyebrow">{t('overview.eyebrow')}</span><span className="scorm-health-pill is-online"><span className="scorm-health-dot"/> {t('overview.online')}</span></div><h2 className="scorm-display"><span>{t('overview.titleA')}</span> <span className="wb-accent">{t('overview.titleB')}</span></h2><p>{t('overview.copy')}</p></div><div className="hero-actions"><button className="scorm-button-secondary" onClick={() => onOpenSection('Reports')}><FileText size={15}/> {t('nav.reports')}</button><button className="scorm-button-primary" onClick={() => onOpenSection(isSuperAdmin ? 'Tenants' : 'Branches')}><Plus size={15}/> {isSuperAdmin ? t('tenant.create') : t('branch.add')}</button></div></div></section><div className="metric-grid">{stats.map((s) => <MetricCard key={s.label} {...s}/>)}</div><div className="overview-grid"><div>{isSuperAdmin && <PlatformTenants token={token}/>} {!isSuperAdmin && tenantAdmin && <TenantBranches token={token} membership={tenantAdmin}/>} {!isSuperAdmin && !tenantAdmin && <section className="scorm-panel roadmap-panel"><div className="scorm-action-icon"><Activity size={18}/></div><div className="scorm-eyebrow">{t('nav.branches')}</div><h3>{t('branch.management')}</h3><p>{t('branch.noBranchesCopy')}</p></section>}</div><div className="overview-side"><section className="scorm-progress-hero"><div className="progress-hero-top"><div><div className="scorm-progress-kicker">{t('overview.phase')}</div><h3>{t('overview.readiness')}</h3></div><div className="scorm-progress-icon"><Activity size={18}/></div></div><div><div className="scorm-progress-number">{t('overview.phase')}</div><div className="progress-copy">{t('overview.phaseCopy')}</div><div className="scorm-progress-track is-dark"><div className="scorm-progress-fill" style={{width:'94%'}}/></div></div></section><section className="scorm-panel quick-panel"><SectionHeader eyebrow={t('overview.workspace')} title={t('overview.quick')}/><div className="quick-list"><button onClick={() => onOpenSection('Inventory')}><PackageSearch size={15}/><span><strong>{t('nav.inventory')}</strong><small>{t('inventory.subtitle')}</small></span><ChevronRight size={14}/></button><button onClick={() => onOpenSection('Restaurant')}><UtensilsCrossed size={15}/><span><strong>{t('nav.restaurant')}</strong><small>{t('restaurant.subtitle')}</small></span><ChevronRight size={14}/></button><button onClick={() => onOpenSection('Analytics')}><BarChart3 size={15}/><span><strong>{t('nav.analytics')}</strong><small>{t('analytics.subtitle')}</small></span><ChevronRight size={14}/></button><button onClick={() => onOpenSection('Reports')}><FileText size={15}/><span><strong>{t('nav.reports')}</strong><small>{t('reports.subtitle')}</small></span><ChevronRight size={14}/></button></div></section></div></div></div>;
}

function Dashboard() {
  const { token, session, logout } = useAuth(); const { t } = useLanguage(); const [theme, toggleTheme] = usePlatformTheme(); const [mobileOpen, setMobileOpen] = useState(false); const [activeSection, setActiveSection] = useState('Overview');
  const access = session?.access || {}; const isSuperAdmin = Boolean(access.isSuperAdmin); const tenantAdmin = (access.tenants || []).find((m) => m.role === 'TENANT_ADMIN'); const primaryRole = isSuperAdmin ? t('auth.superAdmin') : tenantAdmin ? t('auth.tenantAdmin') : access.branches?.[0]?.role?.replaceAll('_',' ') || t('auth.branchStaff');
  const groups = useMemo(() => [{ key:'nav.platform', items:[{label:'Overview',icon:BarChart3},...(isSuperAdmin?[{label:'Tenants',icon:Building2}]:[]),{label:'Branches',icon:Store}]},{key:'nav.operations',items:[{label:'Inventory',icon:PackageSearch},{label:'Sales & Orders',icon:ClipboardList},{label:'Restaurant',icon:UtensilsCrossed},{label:'Analytics',icon:BarChart3},{label:'Reports',icon:FileText},{label:'Staff',icon:UsersRound}]}],[isSuperAdmin]);
  function openSection(section) { setActiveSection(section); setMobileOpen(false); }
  function Navigation() { return <nav className="scorm-nav">{groups.map((group,index)=><div className={index?'nav-group nav-group-spaced':'nav-group'} key={group.key}><div className="scorm-nav-section">{t(group.key)}</div><div className="nav-items">{group.items.map(({label,icon:Icon})=>{const active=activeSection===label;return <button key={label} type="button" className={`scorm-nav-item ${active?'scorm-nav-active':''}`} onClick={()=>openSection(label)}><span className="scorm-nav-icon"><Icon size={16}/></span><span>{t(SECTION_KEYS[label])}</span>{active&&<ChevronRight size={14} className="scorm-nav-chevron"/>}</button>})}</div></div>)}</nav>; }
  function Brand() { return <button type="button" className="scorm-brand" onClick={()=>openSection('Overview')}><span className="scorm-brand-mark"><Layers3 size={19}/></span><span className="brand-copy"><strong className="scorm-brand-name">OUTLET <em>OS</em></strong><small>{t('auth.top')}</small></span></button>; }
  return <div className={`scorm-editorial scorm-theme-${theme}`}><aside className="scorm-sidebar"><div className="scorm-brand-wrap"><Brand/></div><Navigation/><div className="scorm-sidebar-footer"><div className="scorm-status-card"><div className="status-title"><span className="scorm-status-dot"/>{primaryRole}</div><div className="status-copy">{session?.user?.email}</div></div><button type="button" onClick={logout} className="scorm-sidebar-switch"><span><LogOut size={14}/> {t('common.signOut')}</span><ChevronRight size={13}/></button></div></aside>{mobileOpen&&<div className="mobile-overlay"><button aria-label="Close navigation" className="mobile-backdrop" onClick={()=>setMobileOpen(false)}/><div className="scorm-mobile-drawer"><div className="drawer-head"><Brand/><button className="scorm-drawer-close" onClick={()=>setMobileOpen(false)}><X size={17}/></button></div><Navigation/><div className="drawer-foot"><LanguageSwitcher/><button type="button" onClick={logout} className="scorm-sidebar-switch"><span><LogOut size={14}/> {t('common.signOut')}</span><ChevronRight size={13}/></button></div></div></div>}<div className="scorm-shell-content"><header className="scorm-topbar"><button type="button" onClick={()=>setMobileOpen(true)} className="scorm-topbar-icon mobile-menu-trigger"><Menu size={18}/></button><div className="topbar-context"><ShieldCheck size={12}/> {t('overview.liveAccess')} · {primaryRole}</div><div className="topbar-actions"><LanguageSwitcher compact/><ThemeToggle theme={theme} onToggle={toggleTheme}/><button className="scorm-button-secondary topbar-secondary" onClick={()=>openSection('Reports')}><FileText size={14}/> {t('nav.reports')}</button><button className="scorm-button-primary" onClick={()=>openSection(isSuperAdmin?'Tenants':'Branches')}><Plus size={14}/><span>{isSuperAdmin?t('tenant.create'):t('branch.add')}</span></button></div></header><main className="scorm-main">{activeSection==='Overview'&&<Overview token={token} access={access} isSuperAdmin={isSuperAdmin} tenantAdmin={tenantAdmin} primaryRole={primaryRole} onOpenSection={openSection}/>} {activeSection==='Tenants'&&isSuperAdmin&&<div className="platform-page standalone-page"><PlatformTenants token={token}/></div>} {activeSection==='Branches'&&tenantAdmin&&<div className="platform-page standalone-page"><TenantBranches token={token} membership={tenantAdmin}/></div>} {activeSection==='Inventory'&&<InventoryWorkspace token={token} access={access}/>} {activeSection==='Sales & Orders'&&<SalesWorkspace token={token} access={access}/>} {activeSection==='Restaurant'&&<RestaurantWorkspace token={token} access={access}/>} {activeSection==='Analytics'&&<AnalyticsWorkspace token={token} access={access}/>} {activeSection==='Reports'&&<ReportsWorkspace token={token} access={access}/>} {activeSection==='Staff'&&<StaffWorkspace token={token} access={access}/>}</main></div><div className="scorm-mobile-tabbar">{[{label:'Overview',icon:BarChart3},{label:'Inventory',icon:PackageSearch},{label:'Sales & Orders',icon:ClipboardList},{label:'Restaurant',icon:UtensilsCrossed}].map(({label,icon:Icon})=><button key={label} className={`scorm-mobile-tab ${activeSection===label?'is-active':''}`} onClick={()=>openSection(label)}><Icon size={17}/><span>{t(SECTION_KEYS[label])}</span></button>)}</div></div>;
}

export default function App() {
  const { session, loading } = useAuth();
  if (loading) return <div className="app-loading"><RefreshCw size={23} className="spin"/></div>;
  if (!session) return <LoginScreen/>;
  if (session.pendingApproval || !session.access?.approved) return <PendingScreen/>;
  return <Dashboard/>;
}
