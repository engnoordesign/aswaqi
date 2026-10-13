import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {DatabaseSync} from 'node:sqlite';
import {createApp} from '../server.js';
import {openDatabase,getStore} from '../backend/database.js';
import {hashPassword} from '../backend/security.js';
import {initial} from '../shared/engine.js';

const tmp=()=>mkdtempSync(join(tmpdir(),'aswaqi-setup-'));
async function start(databasePath){
 const app=createApp({databasePath,appUrl:'http://localhost:3000'});
 app.server.listen(0,'127.0.0.1');await once(app.server,'listening');
 const base='http://127.0.0.1:'+app.server.address().port;
 const req=async(path,{method='GET',payload,cookie='',origin='http://localhost:3000'}={})=>{const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Origin:origin,...(cookie?{Cookie:cookie}:{})},body:payload===undefined?undefined:JSON.stringify(payload)});return {status:r.status,json:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]}};
 return {app,req};
}

test('browser first-run setup creates the manager once, then username sign-in works',async()=>{
 const dir=tmp();const {app,req}=await start(join(dir,'db.sqlite'));
 try{
  assert.deepEqual((await req('/api/setup')).json,{needed:true});
  assert.equal((await req('/api/auth/login',{method:'POST',payload:{username:'admin',password:'whatever-123456'}})).status,401);
  assert.equal((await req('/api/setup',{method:'POST',payload:{username:'a b',password:'long-enough-pass-1'}})).status,400);
  assert.equal((await req('/api/setup',{method:'POST',payload:{username:'admin',password:'short'}})).status,400);
  assert.equal(getStore(app.db),null);
  const created=await req('/api/setup',{method:'POST',payload:{username:'Admin',password:'long-enough-pass-1',storeName:'Corner Market'}});
  assert.equal(created.status,200);assert.ok(created.cookie);
  const store=(await req('/api/store',{cookie:created.cookie})).json;
  assert.equal(store.role,'manager');assert.equal(store.username,'admin');assert.equal(store.state.settings.name,'Corner Market');
  assert.deepEqual((await req('/api/setup')).json,{needed:false});
  assert.equal((await req('/api/setup',{method:'POST',payload:{username:'intruder',password:'long-enough-pass-2'}})).status,409);
  // Case-insensitive username; 127.0.0.1 is accepted as well as localhost when running locally.
  assert.equal((await req('/api/auth/login',{method:'POST',origin:'http://127.0.0.1:3000',payload:{username:'ADMIN',password:'long-enough-pass-1'}})).status,200);
  assert.equal((await req('/api/auth/login',{method:'POST',payload:{username:'admin',password:'wrong-password-1'}})).status,401);
  const staff=await req('/api/store',{method:'POST',cookie:created.cookie,payload:{revision:store.revision,action:'user',payload:{name:'Ali',username:'ali.cashier',role:'cashier',password:'cashier-pass-123'}}});
  assert.equal(staff.status,200);assert.ok(staff.json.state.users.some(u=>u.username==='ali.cashier'));
  assert.equal((await req('/api/auth/login',{method:'POST',payload:{username:'ali.cashier',password:'cashier-pass-123'}})).status,200);
 }finally{await app.close();rmSync(dir,{recursive:true,force:true})}
});

test('databases from the email-based version are migrated and keep working',async()=>{
 const dir=tmp(),file=join(dir,'old.sqlite');
 const old=new DatabaseSync(file);
 old.exec(`CREATE TABLE store(id TEXT PRIMARY KEY, data TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0);
CREATE TABLE credentials(email TEXT PRIMARY KEY,password_hash TEXT NOT NULL);
CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,email TEXT NOT NULL REFERENCES credentials(email) ON DELETE CASCADE,expires INTEGER NOT NULL);`);
 const state=initial('boss@shop.com');state.users.push({email:'cash@shop.com',name:'Cash',role:'cashier'});
 old.prepare('INSERT INTO credentials VALUES(?,?)').run('boss@shop.com',await hashPassword('old-owner-pass-1'));
 old.prepare('INSERT INTO credentials VALUES(?,?)').run('cash@shop.com',await hashPassword('old-cash-pass-12'));
 old.prepare('INSERT INTO store VALUES(?,?,0)').run('main',JSON.stringify(state));old.close();
 const db=openDatabase(file);
 assert.ok(db.prepare('PRAGMA table_info(credentials)').all().some(c=>c.name==='username'));
 assert.deepEqual(getStore(db).state.users,[{username:'cash@shop.com',name:'Cash',role:'cashier'}]);db.close();
 const {app,req}=await start(file);
 try{
  assert.equal((await req('/api/auth/login',{method:'POST',payload:{username:'boss@shop.com',password:'old-owner-pass-1'}})).status,200);
  assert.equal((await req('/api/auth/login',{method:'POST',payload:{username:'cash@shop.com',password:'old-cash-pass-12'}})).status,200);
 }finally{await app.close();rmSync(dir,{recursive:true,force:true})}
});
