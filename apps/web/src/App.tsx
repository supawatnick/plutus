import { useState } from 'react';
import { LayoutDashboard, Package, ArrowLeftRight, Search, Download, Menu, X, Shield, ChevronDown } from 'lucide-react';

type Status = 'Available' | 'Borrowed' | 'Demo Lab' | 'Retired';
const assets: { id: string; name: string; serial: string; status: Status; location: string }[] = [
  { id:'AST-000001', name:'Dell Latitude 5450', serial:'DL-5420-S001', status:'Available', location:'IT Storage' },
  { id:'AST-000002', name:'Cisco Catalyst 9200', serial:'C9200-F033', status:'Borrowed', location:'Customer Site / BKK' },
  { id:'AST-000003', name:'HPE ProLiant DL380', serial:'HPE-DL-7781', status:'Demo Lab', location:'Demo Lab' },
  { id:'AST-000004', name:'Dell P2425H Monitor', serial:'DP-404921', status:'Available', location:'IT Storage' },
  { id:'AST-000005', name:'Fortinet FortiGate 60F', serial:'FG-60F-1011', status:'Retired', location:'Archive Room' },
  { id:'AST-000006', name:'Lenovo ThinkPad T14', serial:'LEN-T14-9038', status:'Borrowed', location:'Project Alpha' },
];
const navigation=[{label:'Dashboard',icon:LayoutDashboard},{label:'Inventory',icon:Package},{label:'Borrow / Return',icon:ArrowLeftRight}];
const stats:[string, string, string][]=[['TOTAL ASSETS','06','total'],['AVAILABLE','02','available'],['BORROWED','02','borrowed'],['DEMO LAB','01','lab'],['RETIRED','01','retired']];
function App(){
 const [page,setPage]=useState('Dashboard');
 const [search,setSearch]=useState('');
 const [status,setStatus]=useState('All Status');
 const [menu,setMenu]=useState(false);
 const visible=assets.filter(a=>[a.id,a.name,a.serial,a.location].some(v=>v.toLowerCase().includes(search.toLowerCase())) && (status==='All Status'||a.status===status));
 return <div className="shell">
  <aside className={menu?'sidebar open':'sidebar'}>
   <div className="brand"><span>PLUTUS<span className="dot">.</span></span><button className="close-menu" onClick={()=>setMenu(false)} aria-label="Close menu"><X size={18}/></button><small>IT ASSET MANAGEMENT</small></div>
   <div className="nav-label">WORKSPACE / 01</div>
   <nav>{navigation.map(({label,icon:Icon})=><button key={label} className={page===label?'nav-link active':'nav-link'} onClick={()=>{setPage(label);setMenu(false)}}><Icon size={17}/>{label}<span className="nav-arrow">↗</span></button>)}</nav>
   <div className="sidebar-bottom"><span className="online-dot"/> LOCAL ENVIRONMENT <small>DESIGN PREVIEW · NO LIVE DATA</small></div>
  </aside>
  <main className="main">
   <header className="topbar"><button className="mobile-menu" aria-label="Open menu" onClick={()=>setMenu(true)}><Menu size={20}/></button><span>PLUTUS <span className="muted">/ {page.toUpperCase()}</span></span><div className="user"><Shield size={15}/> DESIGN DEMO <span className="avatar">IT</span></div></header>
   <div className="content"><div className="eyebrow">SYSTEM OVERVIEW <span className="separator">/</span> 2026</div><div className="heading"><div><h1>{page==='Dashboard'?'Dashboard':page}</h1><p>Manage company IT assets, inventory and equipment loans.</p></div><span className="preview">STATIC PREVIEW</span></div>
   {page==='Dashboard'&&<><section className="stats">{stats.map(([name,value,key])=><div className={'stat '+key} key={key}><div className="stat-name">{name}<span>↗</span></div><div className="stat-value">{value}</div><div className="stat-foot">ASSET RECORDS</div></div>)}</section><div className="section-head"><h2>Asset Overview</h2><span>INVENTORY / SAMPLE DATA</span></div></>}
   {page==='Borrow / Return'?<section className="empty-state"><ArrowLeftRight size={24}/><h2>Borrow / Return</h2><p>Loan management will be connected to the authenticated API in the next implementation stage.</p><span className="preview">NOT ACTIVE</span></section>:<section className="data-section"><div className="table-tools"><label className="search"><Search size={16}/><input aria-label="Search assets" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search asset, serial, location..."/></label><div className="tool-actions"><label className="filter"><select aria-label="Filter by status" value={status} onChange={e=>setStatus(e.target.value)}>{['All Status','Available','Borrowed','Demo Lab','Retired'].map(s=><option key={s}>{s}</option>)}</select><ChevronDown size={14}/></label><button className="export" disabled title="Export requires API integration"><Download size={16}/> EXPORT</button></div></div><div className="table-wrap"><table><thead><tr><th>ASSET ID</th><th>ASSET NAME</th><th>SERIAL NUMBER</th><th>STATUS</th><th>LOCATION</th></tr></thead><tbody>{visible.map(a=><tr key={a.id}><td className="id">{a.id}</td><td className="item-name">{a.name}</td><td>{a.serial}</td><td><span className={'status '+a.status.toLowerCase().replace(' ','-')}><i/> {a.status}</span></td><td>{a.location}</td></tr>)}{visible.length===0&&<tr><td colSpan={5} className="no-data">NO MATCHING ASSETS</td></tr>}</tbody></table></div><div className="table-footer"><span>SHOWING {visible.length} OF {assets.length} SAMPLE ASSETS</span><span>PREVIEW ONLY</span></div></section>}
   <footer className="footer"><span>PLUTUS / INTERNAL ASSET SYSTEM</span><span>VERSION 0.1.0 — UI PROTOTYPE</span></footer>
   </div>
  </main>
 </div>;
}
export default App;
