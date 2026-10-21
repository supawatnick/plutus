import {existsSync,statSync,readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {connect} from 'node:net';
const checks=[];
function check(label,ok,detail){checks.push({label,ok,detail});console.log((ok?'PASS':'BLOCK')+' '+label+(detail?' — '+detail:''));}
function service(name){try{return execFileSync('systemctl',['is-active',name],{encoding:'utf8',timeout:3000}).trim()==='active';}catch{return false;}}
function userExists(name){try{execFileSync('id',['-u',name],{stdio:'ignore',timeout:3000});return true;}catch{return false;}}
function portOpen(port){return new Promise(resolve=>{const s=connect({host:'127.0.0.1',port});s.setTimeout(1000);s.once('connect',()=>{s.destroy();resolve(true)});s.once('error',()=>resolve(false));s.once('timeout',()=>{s.destroy();resolve(false)});});}
const root='/srv/mcp-workspaces/plutus';
check('Dedicated unprivileged service account',userExists('plutus'),'user=plutus');
const envFile='/etc/plutus/plutus.env';
const envExists=existsSync(envFile);
check('Private environment file',envExists,envFile);
if(envExists){
 const s=statSync(envFile);
 check('Environment file permissions',(s.mode&0o077)===0,'group/world access must be disabled');
 const body=readFileSync(envFile,'utf8');
 const config=Object.fromEntries(body.split(/\r?\n/).filter(line=>/^[A-Z][A-Z0-9_]*=/.test(line)).map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1).replace(/^["']|["']$/g,'')]}));
 check('HTTPS production origin',config.PUBLIC_ORIGIN==='https://plutus.followthesunth.com');
 check('Secure session cookies',config.COOKIE_SECURE==='true');
 check('Production DB configured',Boolean(config.DATABASE_URL)&&!config.DATABASE_URL.includes('/plutus_test'));
}
check('Production API active',service('plutus-api'));
check('Production web active',service('plutus-web'));
check('Backup schedule active',service('plutus-backup.timer'));
check('Web compiled',existsSync(root+'/apps/web/dist/index.html'));
check('API compiled',existsSync(root+'/apps/api/dist/server.js'));
check('Web origin reachable',await portOpen(4173));
check('API loopback reachable',await portOpen(3001));
const blocked=checks.filter(x=>!x.ok);
console.log('PRE-FLIGHT: '+(checks.length-blocked.length)+'/'+checks.length+' PASS. '+blocked.length+' blockers.');
if(blocked.length)process.exitCode=2;
