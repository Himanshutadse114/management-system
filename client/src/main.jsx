import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from './AuthContext';
import { LanguageProvider } from './LanguageContext';
import App from './App';
const PublicMenu = lazy(() => import('./PublicMenu'));
const MenuImageManager = lazy(() => import('./MenuImageManager'));
import './design-tokens.css';
import './styles.css';
import './language.css';
import './responsive.css';
import './simple-ui.css';
import './simple-polish.css';
import './readable-type.css';
import './deva-brand.css';
import './desktop-shell-fix.css';
import './deva-navigation.css';
import './impersonation.css';
import './shell-layout-final.css';
import './publicMenuLightFix.css';
import './publicMenuHeroPolish.css';
import './deva-typography.css';

function publicMenuToken() {
  if (typeof window === 'undefined') return null;
  const queryToken = new URLSearchParams(window.location.search).get('menu');
  if (queryToken) return queryToken.trim() || null;
  const match = window.location.pathname.match(/^\/menu\/([^/]+)\/?$/);
  if (!match) return null;
  try { return decodeURIComponent(match[1]); } catch (_) { return match[1]; }
}

function directStoreSlug() {
  if (typeof window === 'undefined') return null;
  const match = window.location.pathname.match(/^\/store\/([^/]+)\/?$/);
  if (!match) return null;
  try { return decodeURIComponent(match[1]); } catch (_) { return match[1]; }
}

const menuToken = publicMenuToken();
const storeSlug = directStoreSlug();
const root = ReactDOM.createRoot(document.getElementById('root'));

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

root.render(
  <React.StrictMode>
    <LanguageProvider>
      <Suspense fallback={<div className="app-loading">Loading Deva...</div>}>{menuToken || storeSlug ? (
        <PublicMenu qrToken={menuToken} storeSlug={storeSlug} />
      ) : (
        <AuthProvider>
          <App />
          <MenuImageManager />
        </AuthProvider>
      )}</Suspense>
    </LanguageProvider>
  </React.StrictMode>
);
