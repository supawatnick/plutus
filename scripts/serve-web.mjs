import express from 'express';
import {request as httpRequest} from 'node:http';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';

const webPort=Number(process.env.WEB_PORT||4173);
const webHost=process.env.WEB_HOST||'127.0.0.1';
const apiPort=Number(process.env.API_PORT||3001);
if(!Number.isInteger(webPort)||webPort<1||webPort>65535||!Number.isInteger(apiPort)||apiPort<1||apiPort>65535)throw new Error('Invalid web/API port');
const dist=resolve(dirname(fileURLToPath(import.meta.url)),'../apps/web/dist');
const app=express();
app.disable('x-powered-by');
app.get('/health',(_req,res)=>res.json({status:'ok',service:'plutus-web'}));
app.use('/api',(req,res)=>{
 const headers={...req.headers,host:'127.0.0.1:'+apiPort};
 const proxy=httpRequest({hostname:'127.0.0.1',port:apiPort,path:req.originalUrl,method:req.method,headers,timeout:15000},upstream=>{
  res.writeHead(upstream.statusCode||502,upstream.headers);
  upstream.pipe(res);
 });
 proxy.on('error',()=>{if(!res.headersSent)res.status(502).json({code:'API_UNAVAILABLE',message:'API service unavailable'});else res.destroy();});
 proxy.on('timeout',()=>proxy.destroy(new Error('API timeout')));
 req.pipe(proxy);
});
app.use(express.static(dist,{index:false,setHeaders:(res,path)=>{
 res.setHeader('X-Content-Type-Options','nosniff');
 if(path.endsWith('.html'))res.setHeader('Cache-Control','no-store');
 else if(path.includes('/assets/'))res.setHeader('Cache-Control','public,max-age=31536000,immutable');
}}));
app.use((req,res)=>{
 if(req.method!=='GET'&&req.method!=='HEAD')return res.status(405).send('Method not allowed');
 res.set('Cache-Control','no-store');
 res.set('X-Content-Type-Options','nosniff');
 res.sendFile(resolve(dist,'index.html'));
});
app.listen(webPort,webHost,()=>console.log('Plutus web origin on '+webHost+':'+webPort));
