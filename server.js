import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {openDatabase,getStore,transaction} from './backend/database.js';
import {normalizeEmail,hashPassword,verifyPassword,sessionToken,digest,cookieToken} from './backend/security.js';
import {act,roleFor,visible} from './shared/engine.js';
import {bootstrapOwner} from './backend/owner.js';
import {scheduleBackups} from './backend/backup.js';
const root=fileURLToPath(new URL('.',import.meta.url));
const json=(res,status,data,headers={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});res.end(JSON.stringify(data))};
async function body(req){let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>1024*1024)throw Object.assign(Error('Request too large'),{status:413});chunks.push(chunk)}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw Object.assign(Error('Invalid JSON'),{status:400})}}
const failure=(message,status=400)=>Object.assign(Error(message),{status});
export function createApp(options={}){
 const appUrl=new URL(options.appUrl||process.env.APP_URL||'http://localhost:3000');
 if(!['http:','https:'].includes(appUrl.protocol))throw Error('APP_URL must be http or https');
 const dist=resolve(options.distPath||resolve(root,'dist'));
 const allowedOrigins=new Set([appUrl.origin]);if(process.env.NODE_ENV!=='production')allowedOrigins.add('http://localhost:5173');
 // Extra origins, e.g. the shop's LAN address: ALLOWED_ORIGINS=http://192.168.1.20:3000,http://pos.local:3000
 for(const entry of String(options.allowedOrigins??process.env.ALLOWED_ORIGINS??'').split(',').map(v=>v.trim()).filter(Boolean)){let origin;try{origin=new URL(entry)}catch{throw Error('ALLOWED_ORIGINS contains an invalid URL: '+entry)}if(!['http:','https:'].includes(origin.protocol))throw Error('ALLOWED_ORIGINS entries must be http or https');allowedOrigins.add(origin.origin)}
 // Behind a reverse proxy (Nginx/Caddy/Docker bridge), every request shares the proxy's address.
 // TRUST_PROXY=true uses the address the proxy appends to X-Forwarded-For for login rate limits.
 const trustProxy=/^(1|true|yes)$/i.test(String(options.trustProxy??process.env.TRUST_PROXY??''));
 const clientAddress=req=>{if(trustProxy){const forwarded=String(req.headers['x-forwarded-for']||'').split(',').map(v=>v.trim()).filter(Boolean);if(forwarded.length)return forwarded.at(-1)}return req.socket.remoteAddress};
 const secure=appUrl.protocol==='https:';
 const hours=Number(process.env.SESSION_HOURS||12);if(!Number.isFinite(hours)||hours<=0||hours>168)throw Error('SESSION_HOURS must be between 0 and 168');
 const db=openDatabase(options.databasePath||process.env.DATABASE_PATH||resolve(root,'data/aswaqi.sqlite'));
 const maxAge=Math.floor(hours*3600);
 const cookie=(token,age=maxAge)=>`aswaqi_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${secure?'; Secure':''}`;
 const limits=new Map();
 function limit(key,max,windowMs){const now=Date.now();if(limits.size>10000){for(const [k,v] of limits)if(v.until<now)limits.delete(k);if(limits.size>10000)throw failure('Try again later',429)}let record=limits.get(key);if(!record||record.until<now){record={count:0,until:now+windowMs};limits.set(key,record)}if(++record.count>max)throw failure('Too many attempts. Try later | محاولات كثيرة، حاول لاحقاً',429)}
 function identity(req){const token=cookieToken(req);if(!token)return null;const session=db.prepare('SELECT email,expires FROM sessions WHERE token_hash=?').get(digest(token));if(!session||session.expires<Date.now())return null;const store=getStore(db);const role=store&&roleFor(store.state,session.email);return role?{...store,email:session.email,role}:null}
 const response=c=>({state:visible(c.state,c.role),role:c.role,email:c.email,revision:c.revision});
 const dummy='scrypt:00000000000000000000000000000000:'+ '00'.repeat(64);
 const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','same-origin');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  if(secure)res.setHeader('Strict-Transport-Security','max-age=31536000');
  try{
   const url=new URL(req.url,appUrl),path=url.pathname;
   if(path==='/api/health'&&req.method==='GET'){try{db.prepare('SELECT 1').get();return json(res,200,{ok:true,database:'ok'})}catch{return json(res,503,{ok:false,database:'unavailable'})}}
   if(path.startsWith('/api/')&&req.method!=='GET'&&req.method!=='HEAD'){
    if(!allowedOrigins.has(req.headers.origin))throw failure('Origin not allowed | مصدر الطلب غير مسموح',403);
    if(!String(req.headers['content-type']||'').startsWith('application/json'))throw failure('JSON required',415);
   }
   if(path==='/api/auth/login'&&req.method==='POST'){
    limit('ip:'+clientAddress(req),100,15*60000);const b=await body(req);const email=normalizeEmail(b.email);limit('email:'+email,10,15*60000);
    const credential=db.prepare('SELECT password_hash FROM credentials WHERE email=?').get(email);
    const valid=await verifyPassword(b.password,credential?.password_hash||dummy);
    const store=getStore(db);if(!valid||!credential||!store||!roleFor(store.state,email))throw failure('Incorrect email or password | البريد أو كلمة المرور غير صحيحة',401);
    const token=sessionToken();db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());db.prepare('INSERT INTO sessions(token_hash,email,expires) VALUES(?,?,?)').run(digest(token),email,Date.now()+maxAge*1000);
    limits.delete('email:'+email);return json(res,200,{ok:true},{'Set-Cookie':cookie(token)});
   }
   if(path==='/api/auth/logout'&&req.method==='POST'){db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(cookieToken(req)));return json(res,200,{ok:true},{'Set-Cookie':cookie('',0)})}
   if(path.startsWith('/api/')){
    let c=identity(req);if(!c)throw failure('Sign in required | يرجى تسجيل الدخول',401);
    if(path==='/api/store'&&req.method==='GET')return json(res,200,response(c));
    if(path==='/api/auth/password'&&req.method==='POST'){
     limit('password:'+c.email,10,15*60000);const b=await body(req);const previous=db.prepare('SELECT password_hash FROM credentials WHERE email=?').get(c.email).password_hash;
     if(!await verifyPassword(b.currentPassword,previous))throw failure('Current password is incorrect | كلمة المرور الحالية غير صحيحة',400);
     const hash=await hashPassword(b.newPassword);transaction(db,()=>{const update=db.prepare('UPDATE credentials SET password_hash=? WHERE email=? AND password_hash=?').run(hash,c.email,previous);if(!update.changes)throw failure('Password changed concurrently. Sign in again.',409);db.prepare('DELETE FROM sessions WHERE email=?').run(c.email)});
     return json(res,200,{ok:true},{'Set-Cookie':cookie('',0)});
    }
    if(path==='/api/store'&&req.method==='POST'){
     limit('write:'+c.email,300,60000);const b=await body(req);let passwordHash=null;
     if(b.action==='user'){
      if(c.role!=='manager')throw failure('Access denied | غير مسموح',403);
      const email=normalizeEmail(b.payload?.email);b.payload.email=email;
      const exists=db.prepare('SELECT email FROM credentials WHERE email=?').get(email);
      if(b.payload.password)passwordHash=await hashPassword(b.payload.password);else if(!exists)throw failure('A password is required for a new user | كلمة المرور مطلوبة للموظف الجديد');
      delete b.payload.password;
     }
     const result=transaction(db,()=>{
      c=identity(req);if(!c)throw failure('Sign in required',401);
      if(b.revision!==c.revision)throw failure('Data changed. Refresh and retry | تم تحديث البيانات، حدّث وحاول مجدداً',409);
      const next=act(c.state,c.email,b.action,b.payload||{});
      if(passwordHash){db.prepare('INSERT INTO credentials(email,password_hash) VALUES(?,?) ON CONFLICT(email) DO UPDATE SET password_hash=excluded.password_hash').run(b.payload.email,passwordHash);db.prepare('DELETE FROM sessions WHERE email=?').run(b.payload.email)}
      if(b.action==='removeUser')db.prepare('DELETE FROM credentials WHERE email=?').run(b.payload.email);
      const serialized=JSON.stringify(next);if(Buffer.byteLength(serialized)>32*1024*1024)throw failure('Store capacity reached. Contact your administrator.',413);
      const changed=db.prepare('UPDATE store SET data=?,revision=revision+1 WHERE id=? AND revision=?').run(serialized,'main',c.revision);
      if(!changed.changes)throw failure('Conflicting update. Retry.',409);
      return response({...c,state:next,revision:c.revision+1});
     });return json(res,200,result);
    }
    throw failure('Not found',404);
   }
   if(!['GET','HEAD'].includes(req.method))throw failure('Method not allowed',405);
   let decoded;try{decoded=decodeURIComponent(path)}catch{throw failure('Invalid path')}
   let file=resolve(dist,'.'+decoded);if(file!==dist&&!file.startsWith(dist+sep))throw failure('Not found',404);
   try{if(!(await stat(file)).isFile())file=resolve(dist,'index.html')}catch{if(extname(path))throw failure('Not found',404);file=resolve(dist,'index.html')}
   const bytes=await readFile(file).catch(()=>{throw failure('Frontend missing. Run npm run build.',503)});
   const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2'};
   res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':file.includes(sep+'assets'+sep)?'public,max-age=31536000,immutable':'no-cache'});res.end(req.method==='HEAD'?undefined:bytes);
  }catch(error){if(!res.headersSent){const status=error.status||400;json(res,status,{error:status>=500?'Server unavailable | الخادم غير متاح':error.message})}else res.end()}
 });
 server.requestTimeout=30000;server.headersTimeout=15000;
 return {server,db,close:()=>new Promise((resolve,reject)=>server.close(e=>{db.close();e?reject(e):resolve()}))};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const app=createApp();const port=Number(process.env.PORT||3000),host=process.env.HOST||'127.0.0.1';
 try{await bootstrapOwner(app.db)}catch(error){console.error('First-run setup failed: '+error.message);app.db.close();process.exit(1)}
 const stopBackups=scheduleBackups(app.db);
 app.server.on('error',error=>{console.error(`Cannot listen on ${host}:${port}: ${error.message}`);process.exit(1)});
 app.server.listen(port,host,()=>console.log(`Aswaqi listening on ${host}:${port}. Open ${process.env.APP_URL||'http://localhost:3000'}`));
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{console.log(`${signal} received, shutting down`);stopBackups();app.server.closeIdleConnections?.();app.server.close(()=>{app.db.close();process.exit(0)});setTimeout(()=>process.exit(1),10000).unref()});
}
