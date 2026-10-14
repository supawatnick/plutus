import {spawn} from 'node:child_process';
import {setTimeout as pause} from 'node:timers/promises';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import argon2 from 'argon2';
import assert from 'node:assert/strict';
const uri=process.env.DATABASE_URL;
if(!uri||!uri.includes('plutus_test'))throw new Error('Refusing integration tests outside a database named plutus_test');
const pool=new pg.Pool({connectionString:uri});
const port=3301;
let server;
const base='http://127.0.0.1:'+port+'/api/v1';
async function call(method,path,body,cookie){const res=await fetch(base+path,{method,headers:{...(body?{'content-type':'application/json'}:{}),...(cookie?{cookie}:{})},body:body?JSON.stringify(body):undefined});return {status:res.status,data:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]};}
try{
 await pool.query('DELETE FROM audit_events');await pool.query('DELETE FROM returns');await pool.query('DELETE FROM loans');await pool.query('DELETE FROM inventory');await pool.query('DELETE FROM sessions');await pool.query('DELETE FROM app_users');
 await pool.query('UPDATE sequences SET next_value=1');
 const h=await argon2.hash('integration-fixture-only');
 await pool.query('INSERT INTO app_users(id,username,password_hash,role) VALUES($1,$2,$3,$4)',[randomUUID(),'api-test-manager',h,'ASSET_MANAGER']);
 await pool.query('INSERT INTO app_users(id,username,password_hash,role) VALUES($1,$2,$3,$4)',[randomUUID(),'api-test-viewer',h,'VIEWER']);
 await pool.query('INSERT INTO app_users(id,username,password_hash,role) VALUES($1,$2,$3,$4)',[randomUUID(),'api-test-admin',h,'ADMIN']);
 server=spawn(process.execPath,['apps/api/dist/server.js'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),COOKIE_SECURE:'false',TRUST_PROXY:'false'},stdio:'pipe'});
 let ready=false;for(let i=0;i<80;i++){try{const r=await call('GET','/health');if(r.status===200){ready=true;break;}}catch{}await pause(100);}
 assert(ready,'API did not start');
 const unauth=await call('GET','/inventory');assert.equal(unauth.status,401);
 const login=await call('POST','/auth/login',{username:'api-test-manager',password:'integration-fixture-only'});assert.equal(login.status,200);const cookie=login.cookie;assert(cookie);
 const create=await call('POST','/inventory',{name:'Switch Stock',serial:null,location:'IT Storage',status:'Available',quantity:3},cookie);assert.equal(create.status,201);const id=create.data.item.id;
 const serialized=await call('POST','/inventory',{name:'Laptop',serial:'unique-serial-test-001',location:'IT Storage',status:'Available'},cookie);assert.equal(serialized.status,201);
 const duplicate=await call('POST','/inventory',{name:'Laptop 2',serial:'unique-serial-test-001',location:'IT Storage',status:'Available'},cookie);assert.equal(duplicate.status,409);
 const payload={inventoryId:id,borrowerName:'Test Borrower',borrowerEmail:'test@example.invalid',customerName:'Test Company',customerSite:'Test Site',projectName:'Project 1',quantity:2};
 const [one,two]=await Promise.all([call('POST','/loans',payload,cookie),call('POST','/loans',{...payload,quantity:2},cookie)]);
 assert.deepEqual([one.status,two.status].sort(),[201,409]);
 const loan=(one.status===201?one:two).data.loan;
 const other=await call('POST','/loans',{...payload,quantity:1},cookie);assert.equal(other.status,201);
 const over=await call('POST','/loans',{...payload,quantity:1},cookie);assert.equal(over.status,409);
 const part=await call('POST','/loans/'+loan.id+'/returns',{quantity:1,newLocation:'Returned Shelf',resultingStatus:'Available'},cookie);assert.equal(part.status,200);assert.equal(part.data.loan.returned_qty,1);
 const finish=await call('POST','/loans/'+loan.id+'/returns',{quantity:1,newLocation:'Returned Shelf',resultingStatus:'Available'},cookie);assert.equal(finish.status,200);assert(finish.data.loan.closed_at);
 const viewer=await call('POST','/auth/login',{username:'api-test-viewer',password:'integration-fixture-only'});assert.equal(viewer.status,200);const denied=await call('POST','/inventory',{name:'Blocked',location:'X'},viewer.cookie);assert.equal(denied.status,403);
 const audit=await pool.query('SELECT action FROM audit_events');assert(audit.rows.some(x=>x.action==='BORROW'));assert(audit.rows.some(x=>x.action==='RETURN'));
 console.log('PASS real PostgreSQL integration: auth, role restrictions, unique serial, concurrent stock checkout, partial return, audit');
}finally{server?.kill('SIGTERM');await pool.end();}
