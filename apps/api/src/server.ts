import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import { Pool, PoolClient } from 'pg';
import argon2 from 'argon2';
import multer from 'multer';
import ExcelJS from 'exceljs';
import {parse as csvParse} from 'csv-parse/sync';
import { randomBytes, createHash, createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { z, ZodError } from 'zod';

const env=z.object({DATABASE_URL:z.string().min(1),PORT:z.coerce.number().int().positive().default(3001),COOKIE_SECURE:z.enum(['true','false']).default('true'),TRUST_PROXY:z.enum(['true','false']).default('false')}).safeParse(process.env);
if(!env.success){ console.error('Configure DATABASE_URL, PORT and cookie settings before starting API');process.exit(1);}
const config=env.data;
const pool=new Pool({connectionString:config.DATABASE_URL,max:8});
const app=express();
const lineSecret=process.env.LINE_CHANNEL_SECRET;
const lineAccessToken=process.env.LINE_CHANNEL_ACCESS_TOKEN;
if(config.TRUST_PROXY==='true') app.set('trust proxy',1);
app.disable('x-powered-by');app.use(helmet());

type LineEvent={type?:string;replyToken?:string;source?:{userId?:string};message?:{type?:string;text?:string}};
function commandFromText(input:string){const text=input.trim().slice(0,160);if(/^(รายการยืม|loans)$/i.test(text))return {type:'LOANS' as const,value:''};const status=text.match(/^(?:สถานะ|status)\s+(AST-\d{6,})$/i);if(status)return {type:'STATUS' as const,value:status[1].toUpperCase()};const search=text.match(/^(?:ค้นหา|search)\s+(.{1,80})$/i);if(search)return {type:'SEARCH' as const,value:search[1]};return {type:'HELP' as const,value:''};}
async function lineNaturalCommand(text:string){
 const key=process.env.OPENAI_API_KEY;if(!key)return commandFromText(text);
 if(commandFromText(text).type!=='HELP')return commandFromText(text);
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),8000);
 try{
  const response=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',signal:controller.signal,headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-4.1-mini',temperature:0,max_tokens:80,messages:[{role:'system',content:'Classify an IT inventory question. Output exactly one of: LOANS, STATUS AST-000001, SEARCH followed by a search phrase (max 80 characters), HELP. No other output. Never create, edit, borrow or return data.'},{role:'user',content:text.slice(0,200)}]})});
  if(!response.ok)return {type:'HELP' as const,value:''};
  const result=await response.json() as {choices?:{message?:{content?:string}}[]};const output=result.choices?.[0]?.message?.content?.trim()||'';
  return commandFromText(output);
 }catch{return {type:'HELP' as const,value:''};}finally{clearTimeout(timer);}
}
async function lineAnswer(command:{type:'LOANS'|'STATUS'|'SEARCH'|'HELP';value:string}){
 if(command.type==='STATUS'){const r=await pool.query('SELECT display_id,name,status,location,available_qty,total_qty FROM inventory WHERE display_id=$1 AND deleted_at IS NULL',[command.value]);if(!r.rowCount)return 'ไม่พบ Asset ID นี้';const a=r.rows[0];return [a.display_id,a.name,'Status: '+a.status,'Location: '+a.location,'Available: '+a.available_qty+'/'+a.total_qty].join('\n');}
 if(command.type==='SEARCH'){const term=command.value.slice(0,80).replace(/[\\%_]/g,'\\$&');const r=await pool.query("SELECT display_id,name,status,location FROM inventory WHERE deleted_at IS NULL AND (display_id ILIKE $1 ESCAPE '\\' OR name ILIKE $1 ESCAPE '\\' OR serial ILIKE $1 ESCAPE '\\') ORDER BY display_id LIMIT 5",['%'+term+'%']);return r.rowCount?r.rows.map(a=>[a.display_id,a.name,a.status,a.location].join(' / ')).join('\n'):'ไม่พบอุปกรณ์ที่ค้นหา';}
 if(command.type==='LOANS'){const r=await pool.query('SELECT i.display_id,l.borrower_name,l.expected_return_at FROM loans l JOIN inventory i ON i.id=l.inventory_id WHERE l.closed_at IS NULL ORDER BY l.borrowed_at DESC LIMIT 5');return r.rowCount?r.rows.map(a=>a.display_id+' / '+a.borrower_name+' / '+(a.expected_return_at?new Date(a.expected_return_at).toISOString().slice(0,10):'ไม่กำหนดคืน')).join('\n'):'ไม่มีรายการยืมค้าง';}
 return 'คำสั่ง: สถานะ AST-000001, ค้นหา <ชื่อหรือ Serial>, รายการยืม\nAI ตอบคำถามเพิ่มเติมได้เมื่อตั้งค่า OpenAI API Key';
}
app.post('/api/v1/integrations/line/webhook',express.raw({type:'application/json',limit:'64kb'}),async(req,res)=>{
 try{
  if(!lineSecret||!lineAccessToken)return res.status(503).json({code:'LINE_DISABLED'});
  if(!Buffer.isBuffer(req.body))return res.status(400).json({code:'BODY_INVALID'});
  const signature=req.header('x-line-signature')||'';
  const candidate=createHmac('sha256',lineSecret).update(req.body).digest('base64');
  const lhs=Buffer.from(signature),rhs=Buffer.from(candidate);
  if(lhs.length!==rhs.length||!timingSafeEqual(lhs,rhs))return res.status(401).json({code:'BAD_SIGNATURE'});
  const parsed=JSON.parse(req.body.toString('utf8')) as {events?:LineEvent[]};
  if(!Array.isArray(parsed.events)||parsed.events.length>10)return res.status(400).json({code:'INVALID_EVENTS'});
  for(const event of parsed.events){
   if(event.type!=='message'||event.message?.type!=='text'||!event.source?.userId||!event.replyToken)continue;
   const identity=await pool.query('SELECT u.id FROM line_accounts l JOIN app_users u ON u.id=l.user_id WHERE l.line_user_id=$1 AND l.revoked_at IS NULL AND u.active=true',[event.source.userId]);
   let answer='LINE account นี้ยังไม่ได้ผูกกับบัญชี IT ของ Plutus';
   const linking=(event.message.text||'').trim().match(/^(?:ผูกบัญชี|link)\s+([A-Za-z0-9_-]{16})$/i);
   if(!identity.rowCount&&linking){
    const linked=await tx(async c=>{
     const found=await c.query('SELECT l.user_id FROM line_link_codes l JOIN app_users u ON u.id=l.user_id WHERE l.token_hash=$1 AND l.expires_at>now() AND u.active=true FOR UPDATE OF l',[hash(linking[1])]);
     if(!found.rowCount)return false;
     const bound=await c.query('SELECT 1 FROM line_accounts WHERE line_user_id=$1 AND revoked_at IS NULL',[event.source!.userId]);
     if(bound.rowCount)return false;
     const id=randomUUID();
     await c.query('INSERT INTO line_accounts(id,user_id,line_user_id) VALUES($1,$2,$3)',[id,found.rows[0].user_id,event.source!.userId]);
     await c.query('DELETE FROM line_link_codes WHERE user_id=$1',[found.rows[0].user_id]);
     await audit(c,found.rows[0].user_id,'LINE_LINK','USER',found.rows[0].user_id,null,{linked:true});
     return true;
    });
    answer=linked?'เชื่อมบัญชี Plutus สำเร็จแล้ว ใช้คำสั่ง ค้นหา หรือ สถานะ ได้เลย':'รหัสเชื่อมบัญชีไม่ถูกต้อง หมดอายุ หรือถูกใช้แล้ว';
   }else if(identity.rowCount){
    const cmd=await lineNaturalCommand(event.message.text||'');
    answer=await lineAnswer(cmd);
    await pool.query('INSERT INTO audit_events(id,user_id,action,entity_type,entity_id,after_value) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),identity.rows[0].id,'LINE_QUERY','LINE',null,JSON.stringify({command:cmd.type})]);
   }
   const reply=await fetch('https://api.line.me/v2/bot/message/reply',{method:'POST',headers:{Authorization:'Bearer '+lineAccessToken,'Content-Type':'application/json'},body:JSON.stringify({replyToken:event.replyToken,messages:[{type:'text',text:answer.slice(0,4500)}]})});
   if(!reply.ok)throw new Error('LINE reply failed: '+reply.status);
  }
  return res.json({ok:true});
 }catch(e){console.error('LINE integration error',e instanceof Error?e.message:'unknown');return res.status(502).json({code:'LINE_PROCESSING_FAILED'});}
});

app.use(express.json({limit:'128kb'}));
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:2*1024*1024,files:1}});
type Role='ADMIN'|'ASSET_MANAGER'|'VIEWER';
type Principal={id:string;username:string;role:Role};
declare global {namespace Express {interface Request {principal?:Principal; sessionToken?:string}}}
class ApiError extends Error{constructor(public status:number,public code:string,message:string){super(message);}}
const hash=(x:string)=>createHash('sha256').update(x).digest('hex');
const error=(status:number,code:string,message:string):never=>{throw new ApiError(status,code,message)};
const requiredText=z.string().trim().min(1).max(300);
const assetInput=z.object({name:requiredText,serial:z.string().trim().max(200).nullish(),status:z.enum(['Available','Borrowed','Demo Lab','Retired']).default('Available'),location:requiredText,quantity:z.number().int().positive().max(1000000).optional()});
const loanInput=z.object({inventoryId:z.string().uuid(),borrowerName:requiredText,borrowerEmail:z.string().email(),customerName:requiredText,customerSite:requiredText,projectName:requiredText,purpose:z.string().max(1000).optional(),quantity:z.number().int().positive().default(1),expectedReturnAt:z.string().datetime().nullish()});
const returnInput=z.object({quantity:z.number().int().positive(),newLocation:requiredText,resultingStatus:z.enum(['Available','Demo Lab','Retired']).default('Available')});
const asyncRoute=(handler:express.RequestHandler):express.RequestHandler=>(req,res,next)=>Promise.resolve(handler(req,res,next)).catch(next);
const tx=async<T>(fn:(c:PoolClient)=>Promise<T>):Promise<T>=>{const c=await pool.connect();try{await c.query('BEGIN');const result=await fn(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}};
const audit=async(c:PoolClient,userId:string|null,action:string,entity:string,id:string,before:unknown,after:unknown)=>{await c.query('INSERT INTO audit_events(id,user_id,action,entity_type,entity_id,before_value,after_value) VALUES ($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),userId,action,entity,id,JSON.stringify(before??null),JSON.stringify(after??null)]);};
const nextId=async(c:PoolClient,kind:'asset'|'loan')=>{const r=await c.query('UPDATE sequences SET next_value=next_value+1 WHERE name=$1 RETURNING next_value-1 AS value',[kind]);if(!r.rowCount)error(500,'SEQUENCE_MISSING','Database migration is missing');return (kind==='asset'?'AST-':'LOAN-')+String(r.rows[0].value).padStart(6,'0');};
const session=asyncRoute(async(req,res,next)=>{const cookie=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('plutus_session='))?.slice('plutus_session='.length);if(!cookie)return error(401,'UNAUTHORIZED','Please sign in');
 const r=await pool.query('SELECT u.id,u.username,u.role FROM sessions s JOIN app_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active=true',[hash(cookie)]);
 if(!r.rows.length)return error(401,'UNAUTHORIZED','Session expired');req.principal=r.rows[0];req.sessionToken=cookie;next();});
const allow=(...roles:Role[]):express.RequestHandler=>(req,_res,next)=>req.principal&&roles.includes(req.principal.role)?next():next(new ApiError(403,'FORBIDDEN','Insufficient role'));
const csrf:express.RequestHandler=(req,_res,next)=>{
 const origin=req.headers.origin;
 const site=req.header('sec-fetch-site');
 if(site==='cross-site')return next(new ApiError(403,'ORIGIN_BLOCKED','Cross-site requests blocked'));
 if(origin){
  let source:URL;
  try{source=new URL(origin);}catch{return next(new ApiError(403,'ORIGIN_BLOCKED','Invalid Origin header'));}
  if(!['http:','https:'].includes(source.protocol)||source.origin!==origin)return next(new ApiError(403,'ORIGIN_BLOCKED','Invalid Origin header'));
  const trusted=process.env.PUBLIC_ORIGIN;
  const expected=trusted||((req.secure?'https':'http')+'://'+req.headers.host);
  if(origin!==expected)return next(new ApiError(403,'ORIGIN_BLOCKED','Cross-origin requests blocked'));
 }
 next();
};
const loginAttempts=new Map<string,{until:number,count:number}>();
app.get('/api/v1/health',asyncRoute(async(_req,res)=>{await pool.query('SELECT 1');res.json({status:'ok',service:'plutus-api'});}));
app.post('/api/v1/auth/login',csrf,asyncRoute(async(req,res)=>{const v=z.object({username:z.string().min(1),password:z.string().min(1)}).parse(req.body);const key=req.ip??'unknown';const now=Date.now();const attempt=loginAttempts.get(key);if(attempt&&attempt.count>=10&&attempt.until>now)return error(429,'RATE_LIMIT','Too many login attempts');
 const r=await pool.query('SELECT id,username,role,password_hash FROM app_users WHERE username=$1 AND active=true',[v.username]);const valid=r.rows.length>0&&await argon2.verify(r.rows[0].password_hash,v.password);
 if(!valid){const count=(attempt?.until??0)>now?(attempt?.count??0)+1:1;loginAttempts.set(key,{count,until:now+15*60*1000});return error(401,'INVALID_CREDENTIALS','Invalid username or password');}
 loginAttempts.delete(key);const token=randomBytes(32).toString('base64url');const user=r.rows[0];await tx(async c=>{await c.query('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES ($1,$2,now()+interval \'8 hours\')',[hash(token),user.id]);await audit(c,user.id,'LOGIN','USER',user.id,null,{username:user.username});});
 res.cookie('plutus_session',token,{httpOnly:true,secure:config.COOKIE_SECURE==='true',sameSite:'strict',path:'/',maxAge:8*3600000});res.json({user:{id:user.id,username:user.username,role:user.role}});
}));
app.get('/api/v1/auth/me',session,(req,res)=>res.json({user:req.principal}));
app.post('/api/v1/auth/change-password',session,csrf,asyncRoute(async(req,res)=>{const v=z.object({currentPassword:z.string().min(1),newPassword:z.string().min(8).max(200)}).parse(req.body);const result=await tx(async c=>{const user=await c.query('SELECT password_hash FROM app_users WHERE id=$1 FOR UPDATE',[req.principal!.id]);if(!user.rowCount||!await argon2.verify(user.rows[0].password_hash,v.currentPassword))return error(401,'INVALID_PASSWORD','Current password is incorrect');if(v.currentPassword===v.newPassword)return error(400,'SAME_PASSWORD','Choose a different password');const digest=await argon2.hash(v.newPassword,{type:argon2.argon2id,memoryCost:65536,timeCost:3,parallelism:1});await c.query('UPDATE app_users SET password_hash=$2 WHERE id=$1',[req.principal!.id,digest]);await c.query('DELETE FROM sessions WHERE user_id=$1',[req.principal!.id]);await audit(c,req.principal!.id,'CHANGE_PASSWORD','USER',req.principal!.id,null,{passwordChanged:true});return {ok:true};});res.clearCookie('plutus_session',{path:'/'});res.json(result);}));
app.post('/api/v1/auth/logout',session,csrf,asyncRoute(async(req,res)=>{await pool.query('DELETE FROM sessions WHERE token_hash=$1',[hash(req.sessionToken!)]);res.clearCookie('plutus_session',{path:'/'});res.json({ok:true});}));
app.post('/api/v1/integrations/line/link-code',session,csrf,asyncRoute(async(req,res)=>{
 const code=randomBytes(12).toString('base64url');
 await tx(async c=>{await c.query('DELETE FROM line_link_codes WHERE user_id=$1 OR expires_at<now()',[req.principal!.id]);await c.query("INSERT INTO line_link_codes(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '15 minutes')",[hash(code),req.principal!.id]);await audit(c,req.principal!.id,'LINE_LINK_CODE','USER',req.principal!.id,null,{expiresInMinutes:15});});
 res.json({code,expiresInMinutes:15,instruction:'Send: ผูกบัญชี '+code+' to the Plutus LINE Bot'});
}));
app.delete('/api/v1/integrations/line/account',session,csrf,asyncRoute(async(req,res)=>{
 await tx(async c=>{await c.query('UPDATE line_accounts SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',[req.principal!.id]);await c.query('DELETE FROM line_link_codes WHERE user_id=$1',[req.principal!.id]);await audit(c,req.principal!.id,'LINE_UNLINK','USER',req.principal!.id,null,{revoked:true});});
 res.json({ok:true});
}));
app.get('/api/v1/inventory',session,asyncRoute(async(req,res)=>{const q=z.object({search:z.string().max(200).optional(),status:z.enum(['Available','Borrowed','Demo Lab','Retired']).optional(),limit:z.coerce.number().int().min(1).max(200).default(50),offset:z.coerce.number().int().min(0).default(0)}).parse(req.query);
 const params:any[]=[];let clause='WHERE deleted_at IS NULL';if(q.search){params.push('%'+q.search+'%');clause+=` AND (display_id ILIKE $${params.length} OR name ILIKE $${params.length} OR coalesce(serial,'') ILIKE $${params.length} OR location ILIKE $${params.length} OR id IN (SELECT inventory_id FROM loans WHERE borrower_name ILIKE $${params.length}))`;}if(q.status){params.push(q.status);clause+=` AND status=$${params.length}`;}
 const count=await pool.query('SELECT count(*)::int AS n FROM inventory '+clause,params);params.push(q.limit,q.offset);
 const rows=await pool.query('SELECT id,display_id AS "displayId",name,serial,kind,status,location,total_qty AS "totalQuantity",available_qty AS "availableQuantity" FROM inventory '+clause+` ORDER BY created_at DESC LIMIT $${params.length-1} OFFSET $${params.length}`,params);res.json({items:rows.rows,total:count.rows[0].n});}));
app.post('/api/v1/inventory',session,allow('ADMIN','ASSET_MANAGER'),csrf,asyncRoute(async(req,res)=>{const v=assetInput.parse(req.body);if(v.status==='Borrowed')return error(400,'INVALID_STATUS','Use checkout to mark asset borrowed');const serial=v.serial||null;const kind=serial?'SERIALIZED':'QUANTITY';const quantity=kind==='SERIALIZED'?1:(v.quantity??1);const result=await tx(async c=>{const id=randomUUID();const displayId=await nextId(c,'asset');const row=await c.query('INSERT INTO inventory(id,display_id,name,serial,kind,status,location,total_qty,available_qty) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',[id,displayId,v.name,serial,kind,v.status,v.location,quantity,v.status==='Available'?quantity:0]);await audit(c,req.principal!.id,'CREATE','INVENTORY',id,null,row.rows[0]);return row.rows[0];});res.status(201).json({item:result});}));
app.patch('/api/v1/inventory/:id',session,allow('ADMIN','ASSET_MANAGER'),csrf,asyncRoute(async(req,res)=>{const input=assetInput.partial().parse(req.body);const item=await tx(async c=>{const r=await c.query('SELECT * FROM inventory WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[req.params.id]);if(!r.rows.length)return error(404,'NOT_FOUND','Asset not found');const previous=r.rows[0];const outstanding=await c.query('SELECT coalesce(sum(quantity-returned_qty),0)::int AS qty FROM loans WHERE inventory_id=$1 AND closed_at IS NULL',[previous.id]);const outstandingQty=outstanding.rows[0].qty as number;
 if(outstandingQty>0&&('serial' in input||'quantity' in input))return error(409,'OPEN_LOAN','Serial and quantity cannot change during an open loan');
 if(outstandingQty>0&&input.status&&input.status!==previous.status){
  if(previous.kind!=='SERIALIZED')return error(409,'QUANTITY_LOANS_ACTIVE','Return quantity-based loans individually');
  if(!input.location?.trim())return error(400,'LOCATION_REQUIRED','A new location is required to close a loan');
  if(req.body.confirmCloseLoan!==true)return error(409,'CONFIRM_CLOSE_LOAN','Confirm closing the outstanding loan');
  const open=await c.query('SELECT * FROM loans WHERE inventory_id=$1 AND closed_at IS NULL FOR UPDATE',[previous.id]);
  if(open.rows.length!==1)return error(409,'INVALID_OPEN_LOANS','Expected one serialized open loan');
  const loan=open.rows[0];await c.query('INSERT INTO returns(id,loan_id,qty,new_location,resulting_status,received_by) VALUES($1,$2,1,$3,$4,$5)',[randomUUID(),loan.id,input.location,input.status,req.principal!.id]);
  const closed=await c.query('UPDATE loans SET returned_qty=1,closed_at=now() WHERE id=$1 RETURNING *',[loan.id]);
  await audit(c,req.principal!.id,'RETURN','LOAN',loan.id,loan,closed.rows[0]);
 }if(input.serial!==undefined&&((input.serial||null)!==previous.serial))return error(409,'SERIAL_CHANGE_BLOCKED','Serial changes require a managed migration');if(input.quantity!==undefined&&input.quantity!==previous.total_qty)return error(409,'QUANTITY_CHANGE_BLOCKED','Quantity adjustments need their own audited workflow');if(input.status==='Borrowed')return error(400,'INVALID_STATUS','Use checkout');
 const nextStatus=input.status??previous.status;const available=outstandingQty>0&&nextStatus===previous.status?previous.available_qty:nextStatus==='Available'?previous.total_qty:0;const row=await c.query('UPDATE inventory SET name=$2,status=$3,location=$4,available_qty=$5,updated_at=now() WHERE id=$1 RETURNING *',[previous.id,input.name??previous.name,nextStatus,input.location??previous.location,available]);await audit(c,req.principal!.id,'UPDATE','INVENTORY',previous.id,previous,row.rows[0]);return row.rows[0];});res.json({item});}));
app.delete('/api/v1/inventory/:id',session,allow('ADMIN','ASSET_MANAGER'),csrf,asyncRoute(async(req,res)=>{await tx(async c=>{const r=await c.query('SELECT * FROM inventory WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[req.params.id]);if(!r.rows.length)return error(404,'NOT_FOUND','Asset not found');const outstanding=await c.query('SELECT 1 FROM loans WHERE inventory_id=$1 AND closed_at IS NULL LIMIT 1',[req.params.id]);if(outstanding.rowCount)return error(409,'OPEN_LOAN','Asset has an open loan');await c.query('UPDATE inventory SET deleted_at=now() WHERE id=$1',[req.params.id]);await audit(c,req.principal!.id,'DELETE','INVENTORY',String(req.params.id),r.rows[0],{deleted:true});});res.json({ok:true});}));
app.post('/api/v1/inventory/:id/restore',session,allow('ADMIN','ASSET_MANAGER'),csrf,asyncRoute(async(req,res)=>{await tx(async c=>{const r=await c.query('UPDATE inventory SET deleted_at=NULL,updated_at=now() WHERE id=$1 AND deleted_at IS NOT NULL RETURNING *',[req.params.id]);if(!r.rowCount)return error(404,'NOT_FOUND','Asset not deleted');await audit(c,req.principal!.id,'RESTORE','INVENTORY',String(req.params.id),null,r.rows[0]);});res.json({ok:true});}));
app.get('/api/v1/loans',session,asyncRoute(async(req,res)=>{const r=await pool.query('SELECT l.*,i.display_id AS "assetId",i.name AS "assetName" FROM loans l JOIN inventory i ON i.id=l.inventory_id ORDER BY l.borrowed_at DESC LIMIT 200');res.json({items:r.rows});}));
app.post('/api/v1/loans',session,allow('ADMIN','ASSET_MANAGER'),csrf,asyncRoute(async(req,res)=>{const v=loanInput.parse(req.body);const loan=await tx(async c=>{const r=await c.query('SELECT * FROM inventory WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[v.inventoryId]);if(!r.rows.length)return error(404,'NOT_FOUND','Asset not found');const item=r.rows[0];if(item.status!=='Available'&&!(item.kind==='QUANTITY'&&item.status==='Borrowed'))return error(409,'NOT_AVAILABLE','Asset is not available');if(v.quantity>item.available_qty||item.kind==='SERIALIZED'&&v.quantity!==1)return error(409,'INSUFFICIENT_STOCK','Not enough available quantity');if(item.kind==='SERIALIZED'){const open=await c.query('SELECT 1 FROM loans WHERE inventory_id=$1 AND closed_at IS NULL',[item.id]);if(open.rowCount)return error(409,'ALREADY_BORROWED','Asset already borrowed');}
 const id=randomUUID();const number=await nextId(c,'loan');const result=await c.query('INSERT INTO loans(id,loan_number,inventory_id,borrower_name,borrower_email,customer_name,customer_site,project_name,purpose,quantity,expected_return_at,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *',[id,number,item.id,v.borrowerName,v.borrowerEmail,v.customerName,v.customerSite,v.projectName,v.purpose??null,v.quantity,v.expectedReturnAt??null,req.principal!.id]);await c.query("UPDATE inventory SET available_qty=available_qty-$2,status='Borrowed',updated_at=now() WHERE id=$1",[item.id,v.quantity]);await audit(c,req.principal!.id,'BORROW','LOAN',id,null,result.rows[0]);return result.rows[0];});res.status(201).json({loan});}));
app.post('/api/v1/loans/:id/returns',session,allow('ADMIN','ASSET_MANAGER'),csrf,asyncRoute(async(req,res)=>{const v=returnInput.parse(req.body);const returned=await tx(async c=>{const found=await c.query('SELECT inventory_id FROM loans WHERE id=$1',[req.params.id]);if(!found.rows.length)return error(404,'NOT_FOUND','Loan not found');const itemQ=await c.query('SELECT * FROM inventory WHERE id=$1 FOR UPDATE',[found.rows[0].inventory_id]);const item=itemQ.rows[0];const q=await c.query('SELECT l.*,i.kind FROM loans l JOIN inventory i ON i.id=l.inventory_id WHERE l.id=$1 FOR UPDATE OF l',[req.params.id]);if(!q.rows.length)return error(404,'NOT_FOUND','Loan not found');const loan=q.rows[0];const left=loan.quantity-loan.returned_qty;if(loan.closed_at||v.quantity>left||loan.kind==='SERIALIZED'&&v.quantity!==1)return error(409,'INVALID_RETURN','Return exceeds outstanding quantity');if(loan.kind==='QUANTITY'&&v.resultingStatus!=='Available')return error(400,'QUANTITY_STATUS','Quantity returns must return to Available stock');
 const id=randomUUID();await c.query('INSERT INTO returns(id,loan_id,qty,new_location,resulting_status,received_by) VALUES($1,$2,$3,$4,$5,$6)',[id,loan.id,v.quantity,v.newLocation,v.resultingStatus,req.principal!.id]);const l=await c.query('UPDATE loans SET returned_qty=returned_qty+$2,closed_at=CASE WHEN returned_qty+$2=quantity THEN now() ELSE NULL END WHERE id=$1 RETURNING *',[loan.id,v.quantity]);const current=await c.query('SELECT coalesce(sum(quantity-returned_qty),0)::int AS qty FROM loans WHERE inventory_id=$1 AND closed_at IS NULL',[item.id]);const remain=current.rows[0].qty;
 const nextStatus=loan.kind==='SERIALIZED'?v.resultingStatus:remain>0?'Borrowed':'Available';const available=loan.kind==='SERIALIZED'?(nextStatus==='Available'?1:0):item.available_qty+v.quantity;
 await c.query('UPDATE inventory SET available_qty=$2,status=$3,location=$4,updated_at=now() WHERE id=$1',[item.id,available,nextStatus,v.newLocation]);await audit(c,req.principal!.id,'RETURN','LOAN',loan.id,loan,l.rows[0]);return l.rows[0];});res.json({loan:returned});}));
app.get('/api/v1/users',session,allow('ADMIN'),asyncRoute(async(_req,res)=>{const r=await pool.query('SELECT id,username,role,active,created_at FROM app_users ORDER BY username');res.json({items:r.rows});}));
app.post('/api/v1/users',session,allow('ADMIN'),csrf,asyncRoute(async(req,res)=>{const v=z.object({username:z.string().trim().min(3).max(64).regex(/^[a-zA-Z0-9._-]+$/),password:z.string().min(8).max(200),role:z.enum(['ADMIN','ASSET_MANAGER','VIEWER'])}).parse(req.body);const result=await tx(async c=>{const id=randomUUID();const pwd=await argon2.hash(v.password,{type:argon2.argon2id,memoryCost:65536,timeCost:3,parallelism:1});const r=await c.query('INSERT INTO app_users(id,username,password_hash,role) VALUES ($1,$2,$3,$4) RETURNING id,username,role,active',[id,v.username,pwd,v.role]);await audit(c,req.principal!.id,'CREATE_USER','USER',id,null,r.rows[0]);return r.rows[0];});res.status(201).json({user:result});}));
app.patch('/api/v1/users/:id',session,allow('ADMIN'),csrf,asyncRoute(async(req,res)=>{const v=z.object({role:z.enum(['ADMIN','ASSET_MANAGER','VIEWER']).optional(),active:z.boolean().optional(),password:z.string().min(8).max(200).optional()}).refine(x=>Object.keys(x).length>0).parse(req.body);const updated=await tx(async c=>{await c.query('SELECT pg_advisory_xact_lock(1984001)');const before=await c.query('SELECT id,username,role,active FROM app_users WHERE id=$1 FOR UPDATE',[req.params.id]);if(!before.rows.length)return error(404,'NOT_FOUND','User not found');const prior=before.rows[0];if(prior.role==='ADMIN'&&prior.active&&(v.role&&v.role!=='ADMIN'||v.active===false)){const count=await c.query("SELECT count(*)::int AS n FROM app_users WHERE role='ADMIN' AND active=true");if(count.rows[0].n<=1)return error(409,'LAST_ADMIN','Cannot disable or demote the last active administrator');}
 const pwd=v.password?await argon2.hash(v.password,{type:argon2.argon2id,memoryCost:65536,timeCost:3,parallelism:1}):null;const result=await c.query('UPDATE app_users SET role=$2,active=$3,password_hash=coalesce($4,password_hash) WHERE id=$1 RETURNING id,username,role,active',[prior.id,v.role??prior.role,v.active??prior.active,pwd]);if(v.active===false||v.password||v.role&&v.role!==prior.role)await c.query('DELETE FROM sessions WHERE user_id=$1',[prior.id]);await audit(c,req.principal!.id,'UPDATE_USER','USER',prior.id,prior,{...result.rows[0],passwordChanged:Boolean(v.password)});return result.rows[0];});res.json({user:updated});}));
app.get('/api/v1/dashboard',session,asyncRoute(async(req,res)=>{const r=await pool.query("SELECT coalesce(sum(total_qty),0)::int AS total,count(*)::int AS record_count,coalesce(sum(available_qty),0)::int AS available,coalesce(sum(total_qty-available_qty),0)::int AS unavailable,coalesce(sum(CASE WHEN status='Demo Lab' THEN total_qty ELSE 0 END),0)::int AS demo_lab,coalesce(sum(CASE WHEN status='Retired' THEN total_qty ELSE 0 END),0)::int AS retired FROM inventory WHERE deleted_at IS NULL");const overdue=await pool.query('SELECT count(*)::int AS total FROM loans WHERE closed_at IS NULL AND expected_return_at<now()');const upcoming=await pool.query("SELECT count(*)::int AS total FROM loans WHERE closed_at IS NULL AND expected_return_at>=now() AND expected_return_at<=now()+interval '3 days'");const recent=req.principal!.role==='ADMIN'?(await pool.query('SELECT action,entity_type,entity_id,created_at FROM audit_events ORDER BY created_at DESC LIMIT 8')).rows:[];res.json({totals:r.rows[0],overdue:overdue.rows[0].total,upcoming:upcoming.rows[0].total,recentActivity:recent});}));

type ImportItem={name:string;serial:string|null;location:string;status:'Available'|'Demo Lab'|'Retired';quantity:number;row:number};
async function parseInventoryFile(file:Express.Multer.File|undefined):Promise<{rows:ImportItem[];errors:string[]}>{
 if(!file)throw new ApiError(400,'FILE_REQUIRED','Upload an XLSX or CSV file');
 const suffix=file.originalname.toLowerCase().split('.').pop();
 let records:Record<string,unknown>[];
 if(suffix==='csv'){
  records=csvParse(file.buffer,{columns:true,skip_empty_lines:true,bom:true,trim:true,relax_quotes:false}) as Record<string,unknown>[];
 }else if(suffix==='xlsx'){
  const book=new ExcelJS.Workbook();await book.xlsx.load(file.buffer as unknown as ExcelJS.Buffer);
  const sheet=book.worksheets[0];if(!sheet)throw new ApiError(400,'EMPTY_WORKBOOK','No worksheet found');
  const headers=(sheet.getRow(1).values as unknown[]).slice(1).map(v=>String(v??'').trim());
  records=[];sheet.eachRow((row,num)=>{if(num!==1){const obj:Record<string,unknown>={};headers.forEach((h,i)=>obj[h]=row.getCell(i+1).text);records.push(obj);}});
 }else throw new ApiError(400,'FILE_TYPE','Only CSV and XLSX supported');
 if(records.length>1000)throw new ApiError(400,'TOO_MANY_ROWS','Maximum 1,000 rows per import');
 const rows:ImportItem[]=[],errors:string[]=[];
 records.forEach((raw,index)=>{
  const obj=Object.fromEntries(Object.entries(raw).map(([k,v])=>[k.toLowerCase().replace(/[^a-z0-9]/g,''),String(v??'').trim()]));
  const name=obj.assetname||obj.name||'',serial=obj.serialnumber||obj.serial||null,location=obj.location||'',status=obj.status||'Available';
  const quantity=Number(obj.quantity||1);
  if(!name||!location||name.length>300||location.length>300||serial&&serial.length>200||!['Available','Demo Lab','Retired'].includes(status)||!Number.isSafeInteger(quantity)||quantity<1||quantity>1000000){
   errors.push('Row '+(index+2)+': invalid name, serial, location, status or quantity');return;
  }
  rows.push({name,serial,location,status:status as ImportItem['status'],quantity:serial?1:quantity,row:index+2});
 });
 return {rows,errors};
}
const importHandler=(commit:boolean):express.RequestHandler=>asyncRoute(async(req,res)=>{
 const parsed=await parseInventoryFile(req.file);
 const serials=parsed.rows.filter(r=>r.serial).map(r=>r.serial!.toLowerCase());
 const existing=serials.length?(await pool.query('SELECT lower(serial) AS serial FROM inventory WHERE lower(serial)=ANY($1::text[])',[serials])).rows.map(x=>x.serial as string):[];
 const known=new Set<string>(existing);const newRows:ImportItem[]=[],skipped:{row:number;reason:string}[]=[];
 for(const row of parsed.rows){if(row.serial&&known.has(row.serial.toLowerCase())){skipped.push({row:row.row,reason:'Duplicate serial number'});continue;}if(row.serial)known.add(row.serial.toLowerCase());newRows.push(row);}
 if(!commit)return res.json({total:parsed.rows.length+parsed.errors.length,ready:newRows.length,skipped,errors:parsed.errors,preview:newRows.slice(0,30)});
 if(parsed.errors.length)return res.status(422).json({code:'IMPORT_INVALID',message:'Correct invalid rows before importing',errors:parsed.errors});
 const result=await tx(async c=>{let inserted=0;const skippedAtCommit=[...skipped];
 for(const row of newRows){
  if(row.serial){const exists=await c.query('SELECT 1 FROM inventory WHERE lower(serial)=lower($1)',[row.serial]);if(exists.rowCount){skippedAtCommit.push({row:row.row,reason:'Already imported'});continue;}}
  const id=randomUUID(),display=await nextId(c,'asset'),kind=row.serial?'SERIALIZED':'QUANTITY';
  const output=await c.query('INSERT INTO inventory(id,display_id,name,serial,kind,status,location,total_qty,available_qty) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING RETURNING *',[id,display,row.name,row.serial,kind,row.status,row.location,row.quantity,row.status==='Available'?row.quantity:0]);
  if(!output.rowCount){skippedAtCommit.push({row:row.row,reason:'Serial already exists'});continue;}
  inserted++;await audit(c,req.principal!.id,'IMPORT_CREATE','INVENTORY',id,null,output.rows[0]);
 }
 return {imported:inserted,skipped:skippedAtCommit};
 });return res.json(result);
});
app.post('/api/v1/imports/inventory/preview',session,allow('ADMIN','ASSET_MANAGER'),csrf,upload.single('file'),importHandler(false));
app.post('/api/v1/imports/inventory/commit',session,allow('ADMIN','ASSET_MANAGER'),csrf,upload.single('file'),importHandler(true));

const csvCell=(value:unknown)=>{const raw=String(value??'');const guarded=/^[=+@-]/.test(raw)?"'"+raw:raw;return '"'+guarded.replace(/"/g,'""')+'"';};
const csv=(headers:string[],rows:unknown[][])=>'\ufeff'+[headers,...rows.map(r=>r.map(String))].map(r=>r.map(csvCell).join(',')).join('\r\n')+'\r\n';
app.get('/api/v1/exports/inventory.csv',session,asyncRoute(async(_req,res)=>{const r=await pool.query('SELECT display_id,name,serial,kind,status,location,total_qty,available_qty FROM inventory WHERE deleted_at IS NULL ORDER BY display_id');const rows=r.rows.map(a=>[a.display_id,a.name,a.serial??'',a.kind,a.status,a.location,a.total_qty,a.available_qty]);res.set('Content-Type','text/csv; charset=utf-8');res.set('Content-Disposition','attachment; filename="plutus-inventory.csv"');res.send(csv(['Asset ID','Asset Name','Serial Number','Kind','Status','Location','Total Quantity','Available Quantity'],rows));}));
app.get('/api/v1/exports/loans.csv',session,asyncRoute(async(_req,res)=>{const r=await pool.query('SELECT l.loan_number,i.display_id,l.borrower_name,l.borrower_email,l.customer_name,l.customer_site,l.project_name,l.quantity,l.returned_qty,l.borrowed_at,l.expected_return_at,l.closed_at FROM loans l JOIN inventory i ON i.id=l.inventory_id ORDER BY l.borrowed_at DESC');const rows=r.rows.map(a=>[a.loan_number,a.display_id,a.borrower_name,a.borrower_email,a.customer_name,a.customer_site,a.project_name,a.quantity,a.returned_qty,a.borrowed_at?.toISOString(),a.expected_return_at?.toISOString(),a.closed_at?.toISOString()]);res.set('Content-Type','text/csv; charset=utf-8');res.set('Content-Disposition','attachment; filename="plutus-loans.csv"');res.send(csv(['Loan ID','Asset ID','Borrower','Email','Customer','Site','Project','Quantity','Returned','Borrowed At','Expected Return','Closed At'],rows));}));

const spreadsheet=async(columns:string[],rows:unknown[][]):Promise<Buffer>=>{
 const book=new ExcelJS.Workbook();const sheet=book.addWorksheet('Plutus');
 sheet.addRow(columns);sheet.getRow(1).font={bold:true};sheet.views=[{state:'frozen',ySplit:1}];
 for(const row of rows)sheet.addRow(row.map(value=>{const str=String(value??'');return /^[=+@-]/.test(str)?"'"+str:str;}));
 sheet.columns=columns.map((head,index)=>({width:Math.min(45,Math.max(14,head.length+5,...rows.slice(0,100).map(r=>String(r[index]??'').length+3)))}));
 return Buffer.from(await book.xlsx.writeBuffer());
};
app.get('/api/v1/exports/inventory.xlsx',session,asyncRoute(async(_req,res)=>{
 const result=await pool.query('SELECT display_id,name,serial,kind,status,location,total_qty,available_qty FROM inventory WHERE deleted_at IS NULL ORDER BY display_id');
 const file=await spreadsheet(['Asset ID','Asset Name','Serial','Kind','Status','Location','Total Quantity','Available Quantity'],result.rows.map(r=>[r.display_id,r.name,r.serial??'',r.kind,r.status,r.location,r.total_qty,r.available_qty]));
 res.set('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.set('Content-Disposition','attachment; filename="plutus-inventory.xlsx"');res.send(file);
}));
app.get('/api/v1/exports/loans.xlsx',session,asyncRoute(async(_req,res)=>{
 const result=await pool.query('SELECT l.loan_number,i.display_id,l.borrower_name,l.borrower_email,l.customer_name,l.customer_site,l.project_name,l.quantity,l.returned_qty,l.borrowed_at,l.expected_return_at,l.closed_at FROM loans l JOIN inventory i ON i.id=l.inventory_id ORDER BY l.borrowed_at DESC');
 const file=await spreadsheet(['Loan ID','Asset ID','Borrower','Email','Customer','Site','Project','Quantity','Returned','Borrowed At','Expected Return','Closed At'],result.rows.map(r=>[r.loan_number,r.display_id,r.borrower_name,r.borrower_email,r.customer_name,r.customer_site,r.project_name,r.quantity,r.returned_qty,r.borrowed_at?.toISOString(),r.expected_return_at?.toISOString(),r.closed_at?.toISOString()]));
 res.set('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.set('Content-Disposition','attachment; filename="plutus-loans.xlsx"');res.send(file);
}));
app.get('/api/v1/audit',session,allow('ADMIN'),asyncRoute(async(_req,res)=>{const r=await pool.query('SELECT id,user_id,action,entity_type,entity_id,created_at FROM audit_events ORDER BY created_at DESC LIMIT 100');res.json({items:r.rows});}));
app.use('/api',(_req,res)=>res.status(404).json({code:'NOT_FOUND',message:'No such endpoint'}));
app.use((e:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{if(e instanceof ZodError)return res.status(400).json({code:'VALIDATION_ERROR',message:'Invalid request',details:e.flatten()});if(e instanceof ApiError)return res.status(e.status).json({code:e.code,message:e.message});const pg=e as {code?:string};if(pg.code==='23505')return res.status(409).json({code:'DUPLICATE',message:'An existing record uses this identifier'});console.error('API error',e);return res.status(500).json({code:'INTERNAL_ERROR',message:'Unexpected server error'});});
const port=config.PORT;app.listen(port,'127.0.0.1',()=>console.log('Plutus API on 127.0.0.1:'+port));
export {app,pool};
