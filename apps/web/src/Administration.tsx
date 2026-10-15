import {useCallback,useEffect,useState,type FormEvent} from 'react';
type Role='ADMIN'|'ASSET_MANAGER'|'VIEWER';
type Account={id:string;username:string;role:Role;active:boolean;created_at:string};
type Audit={id:string;user_id:string|null;action:string;entity_type:string;entity_id:string|null;created_at:string};
async function api<T>(path:string,init?:RequestInit):Promise<T>{
 const r=await fetch('/api/v1'+path,{credentials:'same-origin',...init,headers:{'Content-Type':'application/json',...init?.headers}});
 const result=await r.json().catch(()=>({message:'Unexpected API response'}));
 if(!r.ok)throw new Error(result.message||'Request failed');return result as T;
}
export default function Administration(){
 const [accounts,setAccounts]=useState<Account[]>([]),[audit,setAudit]=useState<Audit[]>([]);
 const [draft,setDraft]=useState({username:'',password:'',role:'VIEWER' as Role});
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 const refresh=useCallback(async()=>{try{const [users,events]=await Promise.all([api<{items:Account[]}>('/users'),api<{items:Audit[]}>('/audit')]);setAccounts(users.items);setAudit(events.items);setError('');}catch(e){setError((e as Error).message);}},[]);
 useEffect(()=>{void refresh();},[refresh]);
 async function create(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{await api('/users',{method:'POST',body:JSON.stringify(draft)});setDraft({username:'',password:'',role:'VIEWER'});await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function change(user:Account,patch:{role?:Role;active?:boolean}){setBusy(true);setError('');try{await api('/users/'+user.id,{method:'PATCH',body:JSON.stringify(patch)});await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <div className="admin-layout">
  <section className="form-panel"><h2>IT User Management</h2><p className="subtle">Admin controls access. Borrowers do not require accounts.</p>
   {error&&<p role="alert" className="error">{error}</p>}
   <form className="form-stack" onSubmit={create}><label>USERNAME<input required minLength={3} maxLength={64} value={draft.username} onChange={e=>setDraft({...draft,username:e.target.value})}/></label>
    <label>TEMPORARY PASSWORD (MINIMUM 16 CHARACTERS)<input required minLength={16} type="password" autoComplete="new-password" value={draft.password} onChange={e=>setDraft({...draft,password:e.target.value})}/></label>
    <label>ROLE<select value={draft.role} onChange={e=>setDraft({...draft,role:e.target.value as Role})}><option value="VIEWER">IT Viewer</option><option value="ASSET_MANAGER">IT Asset Manager</option><option value="ADMIN">Admin</option></select></label>
    <button className="primary" disabled={busy}>CREATE IT USER</button></form>
   <div className="admin-users">{accounts.map(u=><div className="admin-user" key={u.id}><div><strong>{u.username}</strong><small>{u.active?'ACTIVE':'INACTIVE'}</small></div>
    <label>ROLE<select aria-label={'Role for '+u.username} disabled={busy} value={u.role} onChange={e=>void change(u,{role:e.target.value as Role})}><option value="ADMIN">Admin</option><option value="ASSET_MANAGER">IT Asset Manager</option><option value="VIEWER">IT Viewer</option></select></label>
    <button className="outline" disabled={busy} onClick={()=>void change(u,{active:!u.active})}>{u.active?'DISABLE':'ENABLE'}</button></div>)}</div>
  </section>
  <section className="form-panel"><h2>Audit Trail</h2><p className="subtle">Most recent 100 events. History is retained by the server.</p>
   <div className="audit-list">{audit.map(entry=><div className="audit-entry" key={entry.id}><strong>{entry.action}</strong><span>{entry.entity_type}</span><time>{new Date(entry.created_at).toLocaleString()}</time></div>)}{audit.length===0&&<p className="subtle">No audit events to display.</p>}</div>
  </section>
 </div>;
}
