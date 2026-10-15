import 'dotenv/config';
import pg from 'pg';
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL required');
const emailConfigured=Boolean(process.env.RESEND_API_KEY&&process.env.EMAIL_FROM);
const lineConfigured=Boolean(process.env.LINE_CHANNEL_ACCESS_TOKEN);
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:2});
async function post(url,token,body){
 const response=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw new Error('Provider HTTP '+response.status);
}
async function send(event,client){
 const due=event.expected_return_at?new Date(event.expected_return_at).toLocaleString('en-GB',{timeZone:'Asia/Bangkok'}):'Not specified';
 const text='PLUTUS '+(event.event_type==='OVERDUE'?'OVERDUE':'RETURN REMINDER')+'\nAsset: '+event.asset_id+'\nLoan: '+event.loan_number+'\nBorrower: '+event.borrower_name+'\nDue: '+due;
 if(event.channel==='EMAIL'){
  await post('https://api.resend.com/emails',process.env.RESEND_API_KEY,{from:process.env.EMAIL_FROM,to:[event.recipient],subject:'PLUTUS / '+event.event_type.replaceAll('_',' '),text});
  return;
 }
 const users=await client.query('SELECT l.line_user_id FROM line_accounts l JOIN app_users u ON u.id=l.user_id WHERE l.revoked_at IS NULL AND u.active=true');
 const recipients=users.rows.map(x=>x.line_user_id);
 if(!recipients.length)throw new Error('No verified LINE IT recipients');
 if(recipients.length>500)throw new Error('LINE recipient limit exceeded');
 await post('https://api.line.me/v2/bot/message/multicast',process.env.LINE_CHANNEL_ACCESS_TOKEN,{to:recipients,messages:[{type:'text',text:text.slice(0,4500)}]});
}
let processed=0,skipped=0,failed=0;
const client=await pool.connect();
try{
 const lock=await client.query('SELECT pg_try_advisory_lock(1984002) AS acquired');
 if(!lock.rows[0].acquired){console.log('Notification worker already active');process.exitCode=0;}
 else{
  try{
   const due=await client.query("SELECT e.*,l.closed_at,l.loan_number,l.borrower_name,l.expected_return_at,i.display_id AS asset_id FROM notification_events e JOIN loans l ON l.id=e.loan_id JOIN inventory i ON i.id=l.inventory_id WHERE e.status IN ('PENDING','FAILED') AND e.attempts<6 AND e.next_attempt_at<=now() ORDER BY e.created_at ASC LIMIT 50");
   for(const event of due.rows){
    if(event.closed_at){
     await client.query("UPDATE notification_events SET status='CANCELLED',last_error='Loan closed before delivery' WHERE id=$1",[event.id]);skipped++;continue;
    }
    if(event.channel==='EMAIL'&&!emailConfigured || event.channel==='LINE'&&!lineConfigured){skipped++;continue;}
    try{
     await send(event,client);
     await client.query("UPDATE notification_events SET status='SENT',sent_at=now(),last_attempt_at=now(),attempts=attempts+1,last_error=NULL WHERE id=$1",[event.id]);
     processed++;
    }catch(e){
     const message=e instanceof Error?e.message:'Unknown provider error';
     await client.query("UPDATE notification_events SET status='FAILED',attempts=attempts+1,last_attempt_at=now(),next_attempt_at=now()+make_interval(mins=>least(1440,5*power(2,least(attempts,8)))::int),last_error=$2 WHERE id=$1",[event.id,message.slice(0,240)]);
     failed++;
    }
   }
  }finally{await client.query('SELECT pg_advisory_unlock(1984002)');}
 }
 console.log('Notification delivery: sent='+processed+' failed='+failed+' skipped='+skipped+'; disabled channels remain pending.');
}finally{client.release();await pool.end();}
if(failed)process.exitCode=1;
