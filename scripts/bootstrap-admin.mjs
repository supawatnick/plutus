import 'dotenv/config';
import {Pool} from 'pg';
import argon2 from 'argon2';
import {randomUUID} from 'node:crypto';
const username=process.env.BOOTSTRAP_ADMIN_USERNAME;
const password=process.env.BOOTSTRAP_ADMIN_PASSWORD;
if(!process.env.DATABASE_URL||!username||!password||password.length<16)throw new Error('Set DATABASE_URL, BOOTSTRAP_ADMIN_USERNAME, BOOTSTRAP_ADMIN_PASSWORD (minimum 16 characters).');
const pool=new Pool({connectionString:process.env.DATABASE_URL});
try{
 const existing=await pool.query('SELECT 1 FROM app_users LIMIT 1');
 if(existing.rowCount)throw new Error('Bootstrap refused: one or more accounts already exist');
 const hash=await argon2.hash(password,{type:argon2.argon2id,memoryCost:65536,timeCost:3,parallelism:1});
 await pool.query("INSERT INTO app_users(id,username,password_hash,role) VALUES ($1,$2,$3,'ADMIN')",[randomUUID(),username,hash]);
 console.log('First administrator created; remove BOOTSTRAP_ADMIN_PASSWORD from the environment now.');
}finally{await pool.end();}
