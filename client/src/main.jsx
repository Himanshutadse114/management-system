import React from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider } from './AuthContext';
import App from './App';
import PublicMenu from './PublicMenu';
import './styles.css';

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

function publicMenuToken() {
  if (typeof window === 'undefined') return null;
  const match = window.location.pathname.match(/^\/menu\/([^/]+)\/?$/);
  if (!match) return null;
  try { return decodeURIComponent(match[1]); } catch (_) { return match[1]; }
}

const menuToken = publicMenuToken();
const root = ReactDOM.createRoot(document.getElementById('root'));

if (menuToken) {
  root.render(
    <React.StrictMode>
      <PublicMenu qrToken={menuToken} />
    </React.StrictMode>
  );
} else {
  root.render(
    <React.StrictMode>
      <GoogleOAuthProvider clientId={googleClientId}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </GoogleOAuthProvider>
    </React.StrictMode>
  );
}
