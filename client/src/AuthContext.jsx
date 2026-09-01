import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, authHeaders } from './api';

const AuthContext = createContext(null);
const TOKEN_KEY = 'devaToken';
const SESSION_KEY = 'devaSession';

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [session, setSession] = useState(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  });
  const [loading, setLoading] = useState(Boolean(token));

  function persist(nextToken, nextSession) {
    setToken(nextToken || null);
    setSession(nextSession || null);
    if (nextToken) localStorage.setItem(TOKEN_KEY, nextToken);
    else localStorage.removeItem(TOKEN_KEY);
    if (nextSession) localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
    else localStorage.removeItem(SESSION_KEY);
  }

  function sessionFromData(data) {
    return {
      user: data.user,
      access: data.access,
      pendingApproval: data.pendingApproval,
      impersonation: data.impersonation || null
    };
  }

  async function refresh() {
    if (!token) {
      setLoading(false);
      return null;
    }
    try {
      const { data } = await api.get('/auth/status', { headers: authHeaders(token) });
      const next = sessionFromData(data);
      persist(token, next);
      return next;
    } catch (error) {
      if (error?.response?.status === 401) persist(null, null);
      throw error;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) refresh().catch(() => {});
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
