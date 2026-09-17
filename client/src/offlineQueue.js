import { api, authHeaders } from './api';
const KEY='devaOfflineSalesV1';
function read(){try{const rows=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(rows)?rows:[];}catch(_){return[];}}
function write(rows){localStorage.setItem(KEY,JSON.stringify(rows.slice(-250)));window.dispatchEvent(new CustomEvent('deva-offline-queue'));}
export function offlineSaleCount(){return read().length;}
export function enqueueOfflineSale(endpoint,body){const rows=read();rows.push({id:crypto.randomUUID(),endpoint,body,queuedAt:new Date().toISOString(),attempts:0,lastError:null});write(rows);return rows.length;}
export async function syncOfflineSales(token){const pending=read(),remaining=[],results=[];for(const item of pending){try{const{data}=await api.post(item.endpoint,item.body,{headers:authHeaders(token)});results.push({id:item.id,status:'SYNCED',data});}catch(error){remaining.push({...item,attempts:item.attempts+1,lastError:error?.response?.data?.message||error.message||'Sync failed'});if(!error?.response)remaining.push(...pending.slice(pending.indexOf(item)+1));if(!error?.response)break;}}write(remaining);return{synced:results.length,remaining:remaining.length,results};}
