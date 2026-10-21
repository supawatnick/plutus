import 'dotenv/config';
import {Pool} from 'pg';
import argon2 from 'argon2';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
const url=process.env.DATABASE_URL;
if(!url||new URL(url).pathname!=='/plutus')throw new Error('Production Plutus DATABASE_URL required');
const pool=new Pool({connectionString:url});
try{
 const exists=await pool.query('SELECT 1 FROM app_users LIMIT 1');
 if(exists.rowCount){console.log('Bootstrap skipped: existing accounts');process.exitCode=0;}
 else{
  const secret=randomBytes(28).toString('base64url');
  const digest=await argon2.hash(secret,{type:argon2.argon2id,memoryCost:65536,timeCost:3,parallelism:1});
  const id=randomUUID();
  await pool.query("INSERT INTO app_users(id,username,password_hash,role) VALUES ($1,'itadmin',$2,'ADMIN')",[id,digest]);
  await mkdir('/root/.plutus',{recursive:true,mode:0o700});
  await writeFile('/root/.plutus/initial-admin-credentials','Username: itadmin\nPassword: '+secret+'\n',{mode:0o600,flag:'wx'});
  console.log('Admin created. Credentials: /root/.plutus/initial-admin-credentials (root access only)');
 }
}finally{await pool.end();}
