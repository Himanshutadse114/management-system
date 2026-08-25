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
  ROLE_LABELS,
  accessForBranchRoles,
  focusedAccessProfile
} from './roleAccess';
import './focused.css';

const THEME_KEY = 'managementSystemTheme';

function readTheme() {
  try { return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'; }
  catch (_) { return 'dark'; }
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
  return <div className="focused-overview">
    <section className="focused-overview-hero"><div><div className="focused-kicker">BRANCH OPERATIONS</div><h1>Your operating scope</h1><p>Every action and report below is limited to the branches where your current membership grants access.</p></div><div className="focused-live"><ShieldCheck size={15}/>Live role enforcement</div></section>
    <div className="focused-branch-grid">{managers.map((row) => <article key={row.membershipId}><div className="focused-branch-icon">{row.branch?.type === 'BAR_RESTAURANT' ? <UtensilsCrossed size={17}/> : <Store size={17}/>}</div><div><span>{row.branch?.type === 'BAR_RESTAURANT' ? 'BAR + RESTAURANT' : 'WINE SHOP'}</span><strong>{row.branch?.name}</strong><small>{row.branch?.code} · {ROLE_LABELS[row.role]}</small></div><span className="focused-active">ACTIVE</span></article>)}</div>
    <section className="focused-quick"><div className="focused-section-title"><div><span>TOOLS</span><h2>Branch management</h2></div></div><div className="focused-tool-grid">{[
      [MODULES.INVENTORY, PackageSearch, 'Stock, purchases, wastage and adjustments'],
      [MODULES.SALES, ClipboardList, 'Counter sales and branch order history'],
      [MODULES.RESTAURANT_MANAGER, UtensilsCrossed, 'Tables, QR menu and service reconciliation'],
      [MODULES.ANALYTICS, BarChart3, 'Branch performance and operating P&L'],
      [MODULES.REPORTS, FileText, 'Branch PDF and Excel reports']
    ].filter(([module]) => module !== MODULES.RESTAURANT_MANAGER || managers.some((row) => row.branch?.type === 'BAR_RESTAURANT')).map(([module, Icon, copy]) => <button key={module} onClick={() => onOpen(module)}><div><Icon size={16}/></div><span><strong>{module}</strong><small>{copy}</small></span><ChevronRight size={14}/></button>)}</div></section>
    {otherRoles.length > 0 && <section className="focused-role-note"><UsersRound size={16}/><div><strong>Additional assigned roles</strong><span>{otherRoles.map((row) => `${ROLE_LABELS[row.role] || row.role} · ${row.branch?.name || row.branchId}`).join('  •  ')}</span></div></section>}
  </div>;
}

function ModuleView({ module, token, access, onOpen }) {
  const narrowed = scopedAccess(access, module);
  if (module === MODULES.BRANCH_OVERVIEW) return <BranchOverview access={access} onOpen={onOpen}/>;
  if (module === MODULES.INVENTORY) return <InventoryWorkspace token={token} access={narrowed}/>;
  if (module === MODULES.SALES) return <SalesWorkspace token={token} access={narrowed}/>;
  if (module === MODULES.RESTAURANT_MANAGER) return <RestaurantManagerWorkspace token={token} access={narrowed}/>;
  if (module === MODULES.CASHIER) return <CashierWorkspace token={token} access={narrowed}/>;
  if (module === MODULES.WAITER) return <WaiterWorkspace token={token} access={narrowed}/>;
  if (module === MODULES.ANALYTICS) return <AnalyticsWorkspace token={token} access={narrowed}/>;
  if (module === MODULES.REPORTS) return <ReportsWorkspace token={token} access={narrowed}/>;
  return null;
}

export default function FocusedWorkspaceShell() {
  const { token, session, logout } = useAuth();
  const access = session?.access || {};
  const profile = useMemo(() => focusedAccessProfile(access), [access]);
  const [theme, toggleTheme] = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeModule, setActiveModule] = useState(profile?.defaultModule || null);

  useEffect(() => {
    if (!profile) return;
    if (!profile.modules.includes(activeModule)) setActiveModule(profile.defaultModule);
  }, [profile, activeModule]);

  if (!profile || !activeModule) return <div className="focused-empty"><ShieldCheck size={24}/><strong>No job workspace assigned</strong><span>Ask your Tenant Admin to assign an active branch role.</span></div>;

  const singlePurpose = profile.modules.length === 1;
  function open(module) { if (profile.modules.includes(module)) setActiveModule(module); setMobileOpen(false); }

  function Brand() {
    return <button className="focused-brand" type="button" onClick={() => open(profile.defaultModule)}><span className="focused-brand-mark"><Layers3 size={18}/></span><span><strong>OUTLET <em>OS</em></strong><small>{profile.primaryRoleLabel}</small></span></button>;
  }

  function Nav() {
    return <nav className="focused-nav"><div className="focused-nav-label">YOUR WORKSPACE</div>{profile.modules.map((module) => { const Icon = MODULE_ICONS[module] || Store; return <button key={module} className={activeModule === module ? 'active' : ''} onClick={() => open(module)}><span><Icon size={16}/></span><strong>{module}</strong>{activeModule === module && <ChevronRight size={13}/>}</button>; })}</nav>;
  }

  if (singlePurpose) {
    return <div className={`focused-single scorm-theme-${theme}`}><header className="focused-single-top"><Brand/><div><LanguageSwitcher compact/><ThemeToggle theme={theme} onToggle={toggleTheme}/><div className="focused-user"><span>{session?.user?.name || profile.primaryRoleLabel}</span><small>{session?.user?.email}</small></div><button className="focused-signout" onClick={logout}><LogOut size={14}/><span>Sign out</span></button></div></header><main className="focused-single-main"><ModuleView module={activeModule} token={token} access={access} onOpen={open}/></main></div>;
  }

  const mobileTabs = profile.modules.filter((module) => module !== MODULES.BRANCH_OVERVIEW).slice(0, 4);
  return <div className={`focused-shell scorm-theme-${theme}`}>
    <aside className="focused-sidebar"><Brand/><Nav/><div className="focused-sidebar-foot"><div><ShieldCheck size={13}/><span><strong>{profile.primaryRoleLabel}</strong><small>{session?.user?.email}</small></span></div><button onClick={logout}><LogOut size={14}/>Sign out</button></div></aside>
    {mobileOpen && <div className="focused-mobile-overlay"><button className="focused-mobile-backdrop" onClick={() => setMobileOpen(false)} aria-label="Close"/><aside className="focused-mobile-drawer"><div className="focused-drawer-head"><Brand/><button onClick={() => setMobileOpen(false)}><X size={17}/></button></div><Nav/><div className="focused-drawer-tools"><LanguageSwitcher/><ThemeToggle theme={theme} onToggle={toggleTheme}/><button className="focused-signout" onClick={logout}><LogOut size={14}/>Sign out</button></div></aside></div>}
    <div className="focused-content"><header className="focused-topbar"><button className="focused-mobile-menu" onClick={() => setMobileOpen(true)}><Menu size={18}/></button><div className="focused-context"><ShieldCheck size={12}/>Branch-scoped access · {profile.primaryRoleLabel}</div><div className="focused-top-actions"><LanguageSwitcher compact/><ThemeToggle theme={theme} onToggle={toggleTheme}/><div className="focused-user"><span>{session?.user?.name || profile.primaryRoleLabel}</span><small>{session?.user?.email}</small></div></div></header><main className="focused-main"><ModuleView module={activeModule} token={token} access={access} onOpen={open}/></main></div>
    {mobileTabs.length > 0 && <div className="focused-mobile-tabs">{mobileTabs.map((module) => { const Icon = MODULE_ICONS[module] || Store; return <button key={module} className={activeModule === module ? 'active' : ''} onClick={() => open(module)}><Icon size={16}/><span>{module.replace('Restaurant Management','Restaurant').replace('Sales & Orders','Sales')}</span></button>; })}</div>}
  </div>;
}
