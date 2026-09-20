import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, authHeaders } from './api';

const AuthContext = createContext(null);
const TOKEN_KEY = 'devaToken';
const SESSION_KEY = 'devaSession';
const AUTH_REFRESH_TIMEOUT_MS = 12000;

function readStoredItem(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (_) {
    return null;
  }
}

function writeStoredItem(key, value) {
  try {
    if (value == null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch (_) {
    // Mobile browsers can temporarily deny storage. React state still keeps the
    // current session usable for the lifetime of this page.
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => readStoredItem(TOKEN_KEY));
  const [session, setSession] = useState(() => {
    try {
      const raw = readStoredItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  });
  // A valid cached session should render immediately on refresh. The server
  // revalidates it in the background, so a slow mobile connection cannot trap
  // the user behind the full-page loading spinner.
  const [loading, setLoading] = useState(Boolean(token && !session));
  const tokenRef = useRef(token);
  const bootStartedRef = useRef(false);

  function persist(nextToken, nextSession) {
    const normalizedToken = nextToken || null;
    tokenRef.current = normalizedToken;
    setToken(normalizedToken);
    setSession(nextSession || null);
    writeStoredItem(TOKEN_KEY, normalizedToken);
    writeStoredItem(SESSION_KEY, nextSession ? JSON.stringify(nextSession) : null);
  }

  function sessionFromData(data) {
    return {
      user: data.user,
      access: data.access,
      pendingApproval: data.pendingApproval,
      impersonation: data.impersonation || null
    };
  }

  async function refresh(options = {}) {
    const activeToken = options.token || tokenRef.current;
    if (!activeToken) {
      setLoading(false);
      return null;
    }
    try {
      const { data } = await api.get('/auth/status', {
        headers: authHeaders(activeToken),
        timeout: options.timeoutMs || AUTH_REFRESH_TIMEOUT_MS
      });
      if (tokenRef.current !== activeToken) return null;
      const next = sessionFromData(data);
      persist(activeToken, next);
      return next;
    } catch (error) {
      if (tokenRef.current === activeToken && [401, 403].includes(error?.response?.status)) {
        persist(null, null);
      }
      throw error;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (bootStartedRef.current) return;
    bootStartedRef.current = true;
    if (token) refresh({ token }).catch(() => {});
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loginWithGoogle(credential) {
    const { data } = await api.post('/auth/google', { credential });
    const next = sessionFromData(data);
    persist(data.token, next);
    return next;
  }

  async function startImpersonation(tenantId, membershipId) {
    if (!token) throw new Error('Sign in again before opening a staff account.');
    const { data } = await api.post('/auth/impersonate', { tenantId, membershipId }, { headers: authHeaders(token) });
    const next = sessionFromData(data);
    persist(data.token, next);
    return next;
  }

  async function stopImpersonation() {
    if (!token) throw new Error('The staff session is no longer available.');
    const { data } = await api.post('/auth/impersonation/stop', {}, { headers: authHeaders(token) });
    const next = sessionFromData(data);
    persist(data.token, next);
    return next;
  }

  function logout() {
    persist(null, null);
  }

  const value = useMemo(() => ({
    token,
    session,
    loading,
    loginWithGoogle,
    startImpersonation,
    stopImpersonation,
    refresh,
    logout
  }), [token, session, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
