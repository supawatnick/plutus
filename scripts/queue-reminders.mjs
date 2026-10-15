import 'dotenv/config';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL required');
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
try{
 const loans=await pool.query("SELECT id,borrower_email,expected_return_at FROM loans WHERE closed_at IS NULL AND expected_return_at IS NOT NULL AND expected_return_at<=now()+interval '3 days'");
 let queued=0;
 for(const loan of loans.rows){
  const type=new Date(loan.expected_return_at).getTime()<Date.now()?'OVERDUE':'UPCOMING_RETURN';
  for(const channel of ['EMAIL','LINE']){
   const key=[type,loan.id,channel].join(':');
   const recipient=channel==='EMAIL'?loan.borrower_email:'IT_TEAM_LINKED_ACCOUNTS';
   const result=await pool.query('INSERT INTO notification_events(id,loan_id,channel,event_type,event_key,recipient) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT(event_key) DO NOTHING',[randomUUID(),loan.id,channel,type,key,recipient]);
   queued+=result.rowCount;
  }
 }
 console.log('Notification queue: '+queued+' new events, '+loans.rowCount+' eligible loans; no messages sent (provider adapters not configured).');
}finally{await pool.end();}
