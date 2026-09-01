import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  ChevronRight,
  ClipboardList,
  FileText,
  Layers3,
  LogOut,
  Menu,
  Moon,
  PackageSearch,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  Store,
  Sun,
  UtensilsCrossed,
  UsersRound,
  X
} from 'lucide-react';
import { useAuth } from './AuthContext';
import { LanguageSwitcher } from './LanguageContext';
import InventoryWorkspace from './InventoryWorkspace';
import SalesWorkspace from './SalesWorkspace';
import RestaurantManagerWorkspace from './RestaurantManagerWorkspace';
import AnalyticsWorkspace from './AnalyticsWorkspace';
import ReportsWorkspace from './ReportsWorkspace';
import WaiterWorkspace from './WaiterWorkspace';
import CashierWorkspace from './CashierWorkspace';
import {
  MODULES,
  MODULE_DESCRIPTIONS,
  ROLE_LABELS,
  accessForBranchRoles,
  focusedAccessProfile
} from './roleAccess';
import './focused.css';

const THEME_KEY = 'devaSimpleTheme';

function readTheme() {
  try { return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'; }
  catch (_) { return 'light'; }
}

function useTheme() {
  const [theme, setTheme] = useState(readTheme);
  useEffect(() => { try { localStorage.setItem(THEME_KEY, theme); } catch (_) {} }, [theme]);
  return [theme, () => setTheme((current) => current === 'light' ? 'dark' : 'light')];
}

const MODULE_ICONS = {
  [MODULES.BRANCH_OVERVIEW]: BarChart3,
  [MODULES.INVENTORY]: PackageSearch,
  [MODULES.SALES]: ClipboardList,
  [MODULES.RESTAURANT_MANAGER]: UtensilsCrossed,
  [MODULES.CASHIER]: ReceiptText,
  [MODULES.WAITER]: UtensilsCrossed,
  [MODULES.ANALYTICS]: BarChart3,
  [MODULES.REPORTS]: FileText
};

function ThemeToggle({ theme, onToggle }) {
  const light = theme === 'light';
  const Icon = light ? Moon : Sun;
  return <button type="button" className="focused-theme" onClick={onToggle}><Icon size={15}/><span>{light ? 'Dark' : 'Light'}</span></button>;
}

function ImpersonationBanner({ session, busy, error, onReturn }) {
  const impersonation = session?.impersonation;
  if (!impersonation?.active) return null;
  return <div className="deva-impersonation-banner">
    <div className="deva-impersonation-copy"><ShieldCheck size={15}/><span><strong>Working as {impersonation.role ? (ROLE_LABELS[impersonation.role] || impersonation.role) : 'staff'}</strong><small>{session?.user?.email} · Business Admin session</small></span></div>
    {error && <span className="deva-impersonation-error">{error}</span>}
    <button type="button" onClick={onReturn} disabled={busy}><RotateCcw size={13}/>{busy ? 'Returning…' : 'Return to Business Admin'}</button>
  </div>;
}

function scopedAccess(access, module) {
  if (module === MODULES.INVENTORY) return accessForBranchRoles(access, ['BRANCH_MANAGER', 'INVENTORY_MANAGER']);
  if (module === MODULES.SALES) return accessForBranchRoles(access, ['BRANCH_MANAGER']);
  if (module === MODULES.RESTAURANT_MANAGER) return accessForBranchRoles(access, ['BRANCH_MANAGER']);
  if (module === MODULES.CASHIER) return accessForBranchRoles(access, ['CASHIER']);
  if (module === MODULES.WAITER) return accessForBranchRoles(access, ['WAITER']);
  if ([MODULES.ANALYTICS, MODULES.REPORTS].includes(module)) return accessForBranchRoles(access, ['BRANCH_MANAGER', 'AUDITOR']);
  return access;
}

function BranchOverview({ access, onOpen }) {
  const managers = (access?.branches || []).filter((row) => row.role === 'BRANCH_MANAGER');
  const otherRoles = (access?.branches || []).filter((row) => row.role !== 'BRANCH_MANAGER');
  const tools = [
    [MODULES.INVENTORY, PackageSearch],
    [MODULES.SALES, ClipboardList],
    [MODULES.RESTAURANT_MANAGER, UtensilsCrossed],
    [MODULES.ANALYTICS, BarChart3],
    [MODULES.REPORTS, FileText]
  ].filter(([module]) => module !== MODULES.RESTAURANT_MANAGER || managers.some((row) => row.branch?.type === 'BAR_RESTAURANT'));

  return <div className="focused-overview">
    <section className="focused-overview-hero">
      <div><div className="focused-kicker">Home</div><h1>Your branches</h1><p>Choose a branch job below. You only see the branches assigned to this staff account.</p></div>
      <div className="focused-live"><ShieldCheck size={15}/> {managers.length} branch{managers.length === 1 ? '' : 'es'}</div>
    </section>

    <div className="focused-branch-grid">{managers.map((row) => <article key={row.membershipId}>
      <div className="focused-branch-icon">{row.branch?.type === 'BAR_RESTAURANT' ? <UtensilsCrossed size={17}/> : <Store size={17}/>}</div>
      <div><span>{row.branch?.type === 'BAR_RESTAURANT' ? 'Restaurant' : 'Wine Shop'}</span><strong>{row.branch?.name}</strong><small>{row.branch?.code} · {ROLE_LABELS[row.role]}</small></div>
      <span className="focused-active">Active</span>
    </article>)}</div>

    <section className="focused-quick">
      <div className="focused-section-title"><div><span>Choose an action</span><h2>What do you want to do?</h2></div></div>
      <div className="focused-tool-grid">{tools.map(([module, Icon]) => <button key={module} onClick={() => onOpen(module)}>
        <div><Icon size={16}/></div><span><strong>{module}</strong><small>{MODULE_DESCRIPTIONS[module]}</small></span><ChevronRight size={14}/>
      </button>)}</div>
    </section>

    {otherRoles.length > 0 && <section className="focused-role-note"><UsersRound size={16}/><div><strong>Other assigned duties</strong><span>{otherRoles.map((row) => `${ROLE_LABELS[row.role] || row.role} · ${row.branch?.name || row.branchId}`).join('  •  ')}</span></div></section>}
  </div>;
}

function SimpleModuleIntro({ module }) {
  if ([MODULES.BRANCH_OVERVIEW, MODULES.WAITER, MODULES.CASHIER].includes(module)) return null;
  return <section className="simple-module-intro"><div><span>{module}</span><h1>{module}</h1><p>{MODULE_DESCRIPTIONS[module]}</p></div></section>;
}

function ModuleView({ module, token, access, onOpen }) {
  const narrowed = scopedAccess(access, module);
  let content = null;
  if (module === MODULES.BRANCH_OVERVIEW) content = <BranchOverview access={access} onOpen={onOpen}/>;
  if (module === MODULES.INVENTORY) content = <InventoryWorkspace token={token} access={narrowed}/>;
  if (module === MODULES.SALES) content = <SalesWorkspace token={token} access={narrowed}/>;
  if (module === MODULES.RESTAURANT_MANAGER) content = <RestaurantManagerWorkspace token={token} access={narrowed}/>;
  if (module === MODULES.CASHIER) content = <CashierWorkspace token={token} access={narrowed}/>;
  if (module === MODULES.WAITER) content = <WaiterWorkspace token={token} access={narrowed}/>;
  if (module === MODULES.ANALYTICS) content = <AnalyticsWorkspace token={token} access={narrowed}/>;
  if (module === MODULES.REPORTS) content = <ReportsWorkspace token={token} access={narrowed}/>;
  return <><SimpleModuleIntro module={module}/>{content}</>;
}

export default function FocusedWorkspaceShell() {
  const { token, session, logout, stopImpersonation } = useAuth();
  const access = session?.access || {};
  const profile = useMemo(() => focusedAccessProfile(access), [access]);
  const [theme, toggleTheme] = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeModule, setActiveModule] = useState(profile?.defaultModule || null);
  const [returning, setReturning] = useState(false);
  const [returnError, setReturnError] = useState('');

  useEffect(() => {
    if (!profile) return;
    if (!profile.modules.includes(activeModule)) setActiveModule(profile.defaultModule);
  }, [profile, activeModule]);

  async function returnToAdmin() {
    try {
      setReturning(true);
      setReturnError('');
      await stopImpersonation();
    } catch (error) {
      setReturnError(error?.response?.data?.message || error?.message || 'Could not return to the Business Admin account.');
    } finally {
      setReturning(false);
    }
  }

  if (!profile || !activeModule) return <div className="focused-empty"><ShieldCheck size={24}/><strong>No work area assigned</strong><span>Please ask your admin to assign your branch and job role.</span></div>;

  const singlePurpose = profile.modules.length === 1;
  function open(module) { if (profile.modules.includes(module)) setActiveModule(module); setMobileOpen(false); }

  function Brand() {
    return <button className="focused-brand" type="button" onClick={() => open(profile.defaultModule)}><span className="focused-brand-mark"><Layers3 size={18}/></span><span><strong>Deva</strong><small>{profile.primaryRoleLabel}</small></span></button>;
  }

  function Nav() {
    return <nav className="focused-nav"><div className="focused-nav-label">Menu</div>{profile.modules.map((module) => {
      const Icon = MODULE_ICONS[module] || Store;
      return <button key={module} className={activeModule === module ? 'active' : ''} onClick={() => open(module)}><span><Icon size={16}/></span><strong>{module}</strong>{activeModule === module && <ChevronRight size={13}/>}</button>;
    })}</nav>;
  }

  const impersonationBanner = <ImpersonationBanner session={session} busy={returning} error={returnError} onReturn={returnToAdmin}/>;

  if (singlePurpose) {
    return <div className={`focused-single scorm-theme-${theme}`}>
      {impersonationBanner}
      <header className="focused-single-top"><Brand/><div><LanguageSwitcher compact/><ThemeToggle theme={theme} onToggle={toggleTheme}/><div className="focused-user"><span>{session?.user?.name || profile.primaryRoleLabel}</span><small>{session?.user?.email}</small></div><button className="focused-signout" onClick={logout}><LogOut size={14}/><span>Sign out</span></button></div></header>
      <main className="focused-single-main"><ModuleView module={activeModule} token={token} access={access} onOpen={open}/></main>
    </div>;
  }

  const mobileTabs = profile.modules.filter((module) => module !== MODULES.BRANCH_OVERVIEW).slice(0, 4);
  return <div className={`focused-shell scorm-theme-${theme}`}>
    {impersonationBanner}
    <aside className="focused-sidebar"><Brand/><Nav/><div className="focused-sidebar-foot"><div><ShieldCheck size={13}/><span><strong>{profile.primaryRoleLabel}</strong><small>{session?.user?.email}</small></span></div><button onClick={logout}><LogOut size={14}/>Sign out</button></div></aside>

    {mobileOpen && <div className="focused-mobile-overlay"><button className="focused-mobile-backdrop" onClick={() => setMobileOpen(false)} aria-label="Close"/><aside className="focused-mobile-drawer"><div className="focused-drawer-head"><Brand/><button onClick={() => setMobileOpen(false)}><X size={17}/></button></div><Nav/><div className="focused-drawer-tools"><LanguageSwitcher/><ThemeToggle theme={theme} onToggle={toggleTheme}/><button className="focused-signout" onClick={logout}><LogOut size={14}/>Sign out</button></div></aside></div>}

    <div className="focused-content"><header className="focused-topbar"><button className="focused-mobile-menu" onClick={() => setMobileOpen(true)}><Menu size={18}/></button><div className="focused-context"><ShieldCheck size={12}/>{profile.primaryRoleLabel}</div><div className="focused-top-actions"><LanguageSwitcher compact/><ThemeToggle theme={theme} onToggle={toggleTheme}/><div className="focused-user"><span>{session?.user?.name || profile.primaryRoleLabel}</span><small>{session?.user?.email}</small></div></div></header><main className="focused-main"><ModuleView module={activeModule} token={token} access={access} onOpen={open}/></main></div>

    {mobileTabs.length > 0 && <div className="focused-mobile-tabs">{mobileTabs.map((module) => { const Icon = MODULE_ICONS[module] || Store; return <button key={module} className={activeModule === module ? 'active' : ''} onClick={() => open(module)}><Icon size={16}/><span>{module}</span></button>; })}</div>}
  </div>;
}