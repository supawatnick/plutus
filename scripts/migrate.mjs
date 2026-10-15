import 'dotenv/config';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required');
const pool=new Pool({connectionString:process.env.DATABASE_URL});
try{
 for(const file of ['001_initial.sql','002_notifications.sql','003_line_link.sql','004_case_insensitive_serial.sql','005_notification_delivery.sql']){
  const sql=await readFile(new URL('../database/'+file,import.meta.url),'utf8');
  await pool.query(sql);
  console.log('Database migration '+file+' applied');
 }
}finally{await pool.end();}
