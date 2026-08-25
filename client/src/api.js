import axios from 'axios';

const backend = String(import.meta.env.VITE_BACKEND_URL || 'http://localhost:5001').replace(/\/$/, '');

export const api = axios.create({
  baseURL: `${backend}/api`,
  timeout: 20000
});

export function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function apiErrorMessage(error) {
  return error?.response?.data?.message || error?.message || 'Something went wrong.';
}
