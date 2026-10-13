import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {createApp} from '../server.js';
import {openDatabase,getStore} from '../backend/database.js';
import {backupDatabase} from '../backend/backup.js';
import {bootstrapOwner,secret} from '../backend/owner.js';
import {verifyPassword} from '../backend/security.js';

const quiet={log(){},error(){}};
const tmp=()=>mkdtempSync(join(tmpdir(),'aswaqi-container-'));

test('first-run bootstrap creates the manager once, from a secret file',async()=>{
 const dir=tmp();const db=openDatabase(join(dir,'db.sqlite'));
 try{
  assert.equal(await bootstrapOwner(db,{},quiet),null);assert.equal(getStore(db),null);
  writeFileSync(join(dir,'pw'),'container-secret-123\n');
  const env={OWNER_EMAIL:'Boss@Example.com',OWNER_PASSWORD_FILE:join(dir,'pw')};
  assert.equal(secret('OWNER_PASSWORD',env),'container-secret-123');
  assert.equal(await bootstrapOwner(db,env,quiet),'boss@example.com');
  const hash=db.prepare('SELECT password_hash FROM credentials WHERE email=?').get('boss@example.com').password_hash;
  assert.ok(await verifyPassword('container-secret-123',hash));
  assert.equal(await bootstrapOwner(db,{OWNER_EMAIL:'other@example.com',OWNER_PASSWORD:'another-secret-1234'},quiet),null);
  assert.equal(db.prepare('SELECT count(*) n FROM credentials').get().n,1);
  await assert.rejects(bootstrapOwner(openDatabase(join(dir,'db2.sqlite')),{OWNER_EMAIL:'a@example.com',OWNER_PASSWORD:'short'},quiet));
 }finally{db.close();rmSync(dir,{recursive:true,force:true})}
});

test('backups are consistent snapshots and old ones are pruned',async()=>{
 const dir=tmp();const db=openDatabase(join(dir,'db.sqlite'));
 try{
  db.prepare('INSERT INTO store VALUES(?,?,0)').run('main','{"x":1}');
  const backups=join(dir,'backups');
  for(let i=0;i<4;i++){backupDatabase(db,{dir:backups,keep:2});await new Promise(r=>setTimeout(r,5))}
  const files=readdirSync(backups);assert.equal(files.length,2);
  const copy=openDatabase(join(backups,files[1]));assert.equal(getStore(copy).state.x,1);copy.close();
 }finally{db.close();rmSync(dir,{recursive:true,force:true})}
});

test('health checks the database; extra origins and proxy-aware rate limits',async()=>{
 const dir=tmp();
 const app=createApp({databasePath:join(dir,'db.sqlite'),appUrl:'https://shop.example.com',allowedOrigins:'http://192.168.1.20:3000/, http://pos.local:3000',trustProxy:true});
 try{
  app.server.listen(0,'127.0.0.1');await once(app.server,'listening');const base='http://127.0.0.1:'+app.server.address().port;
  const health=await fetch(base+'/api/health');assert.equal(health.status,200);assert.deepEqual(await health.json(),{ok:true,database:'ok'});
  const login=(origin,ip)=>fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,'X-Forwarded-For':ip},body:JSON.stringify({email:'nobody@example.com',password:'x'})});
  assert.equal((await login('http://192.168.1.20:3000','10.0.0.1')).status,401);
  assert.equal((await login('http://pos.local:3000','10.0.0.1')).status,401);
  assert.equal((await login('http://evil.example','10.0.0.1')).status,403);
  // Per-email limit (10) is shared, so vary the email; per-IP limit (100) must follow X-Forwarded-For.
  const attempt=(i,ip)=>fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://shop.example.com','X-Forwarded-For':'spoofed, '+ip},body:JSON.stringify({email:`u${i}@example.com`,password:'x'})});
  let status;for(let i=0;i<101;i++)status=(await attempt(i,'10.0.0.2')).status;assert.equal(status,429);
  assert.equal((await attempt(999,'10.0.0.3')).status,401);
 }finally{await app.close();rmSync(dir,{recursive:true,force:true})}
 assert.throws(()=>createApp({databasePath:join(tmp(),'x.sqlite'),allowedOrigins:'not a url'}),/ALLOWED_ORIGINS/);
});
