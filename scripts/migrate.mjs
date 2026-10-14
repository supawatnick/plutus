import 'dotenv/config';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required');
const pool=new Pool({connectionString:process.env.DATABASE_URL});
try{
 const sql=await readFile(new URL('../database/001_initial.sql',import.meta.url),'utf8');
 await pool.query(sql);
 console.log('Database migration 001_initial.sql applied');
}finally{await pool.end();}
