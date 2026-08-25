import React from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider } from './AuthContext';
import { LanguageProvider } from './LanguageContext';
import App from './App';
import PublicMenu from './PublicMenu';
import './styles.css';
import './language.css';

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

function publicMenuToken() {
  if (typeof window === 'undefined') return null;
  const match = window.location.pathname.match(/^\/menu\/([^/]+)\/?$/);
  if (!match) return null;
  try { return decodeURIComponent(match[1]); } catch (_) { return match[1]; }
}

const menuToken = publicMenuToken();
const root = ReactDOM.createRoot(document.getElementById('root'));

root.render(
  <React.StrictMode>
    <LanguageProvider>
      {menuToken ? (
        <PublicMenu qrToken={menuToken} />
      ) : (
        <GoogleOAuthProvider clientId={googleClientId}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </GoogleOAuthProvider>
      )}
    </LanguageProvider>
  </React.StrictMode>
);
