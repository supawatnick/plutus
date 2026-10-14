import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import { z } from 'zod';

const config = z.object({ PORT: z.coerce.number().int().min(1).max(65535).default(3001), NODE_ENV: z.enum(['development','test','production']).default('development') }).parse(process.env);
const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(express.json({limit:'100kb'}));
app.get('/api/v1/health',(_req,res)=>res.json({status:'ok',service:'plutus-api',version:'0.1.0'}));
app.use('/api',(_req,res)=>res.status(404).json({code:'NOT_IMPLEMENTED',message:'The requested API route is not implemented yet.'}));
app.use((error:Error,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{console.error('Unhandled API error:',error.name);res.status(500).json({code:'INTERNAL_ERROR',message:'An unexpected error occurred.'});});
app.listen(config.PORT,'127.0.0.1',()=>console.log(`Plutus API listening on 127.0.0.1:${config.PORT}`));
