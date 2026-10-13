import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {createApp} from '../server.js';
import {initial} from '../shared/engine.js';
import {hashPassword,verifyPassword} from '../backend/security.js';
const origin='http://localhost:3000';
test('standalone API: authentication, provisioning, RBAC, stock, rollback, concurrency, password rotation and persistence',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'aswaqi-test-')),databasePath=join(dir,'store.sqlite');
 let app=createApp({databasePath,appUrl:origin});
 const owner='owner',password='correct-horse-1234';
 try{
  app.db.prepare('INSERT INTO credentials VALUES(?,?)').run(owner,await hashPassword(password));
  app.db.prepare('INSERT INTO store VALUES(?,?,0)').run('main',JSON.stringify(initial(owner)));
  app.server.listen(0,'127.0.0.1');await once(app.server,'listening');let base='http://127.0.0.1:'+app.server.address().port;
  let ownerCookie='',cashierCookie='';
  async function req(path,{method='GET',payload,cookie=ownerCookie,requestOrigin=origin}={}){const res=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Origin:requestOrigin,...(cookie?{Cookie:cookie}:{})},body:payload===undefined?undefined:JSON.stringify(payload)});return {status:res.status,json:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]}}
  assert.equal((await req('/api/store',{cookie:''})).status,401);
  assert.equal((await req('/api/auth/login',{method:'POST',payload:{username:owner,password:'wrong'}})).status,401);
  let login=await req('/api/auth/login',{method:'POST',payload:{username:owner,password}});assert.equal(login.status,200);ownerCookie=login.cookie;
  let current=(await req('/api/store')).json;assert.equal(current.role,'manager');
  async function write(action,payload,cookie=ownerCookie){const r=await req('/api/store',{method:'POST',cookie,payload:{revision:current.revision,action,payload}});if(r.status===200)current=r.json;return r}
  assert.equal((await req('/api/store',{method:'POST',requestOrigin:'https://evil.example',payload:{action:'demo',revision:0}})).status,403);
  assert.equal((await write('user',{name:'Cashier',username:'cashier',role:'cashier',password:'cashier-secret-123'})).status,200);
  assert.ok(!JSON.stringify(current).includes('cashier-secret-123'));
  cashierCookie=(await req('/api/auth/login',{method:'POST',payload:{username:'cashier',password:'cashier-secret-123'}})).cookie;
  const rejected=await write('settings',{name:'bad',currency:'USD',tax:0,receipt:'bad'},cashierCookie);assert.notEqual(rejected.status,200);
  assert.equal((await write('product',{name:'Milk',ar:'حليب',barcode:'123',category:'Dairy',unit:'piece',price:2000,min:1})).status,200);
  const product=current.state.products[0].id;
  assert.equal((await write('purchase',{product,qty:10,cost:1000,party:'Supplier',method:'cash'})).status,200);
  assert.equal((await write('transfer',{lot:current.state.lots[0].id,qty:5,to:'shown'})).status,200);
  const before=current.revision;
  assert.notEqual((await write('sale',{lines:[{product,qty:1}],method:'cash',tendered:1})).status,200);
  const rolledBack=(await req('/api/store')).json;assert.equal(rolledBack.revision,before);assert.equal(rolledBack.state.lots.find(x=>x.location==='shown').qty,5);
  const sale={action:'sale',revision:before,payload:{lines:[{product,qty:4}],method:'cash',tendered:8000}};
  const results=await Promise.all([req('/api/store',{method:'POST',payload:sale}),req('/api/store',{method:'POST',payload:sale})]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  current=(await req('/api/store')).json;assert.equal(current.state.lots.find(x=>x.location==='shown').qty,1);
  const cashierView=(await req('/api/store',{cookie:cashierCookie})).json;assert.equal(cashierView.state.users.length,0);assert.equal(cashierView.state.transactions[0].entries.length,0);
  assert.equal((await req('/api/auth/password',{method:'POST',cookie:cashierCookie,payload:{currentPassword:'cashier-secret-123',newPassword:'new-cashier-secret-456'}})).status,200);
  assert.equal((await req('/api/store',{cookie:cashierCookie})).status,401);
  cashierCookie=(await req('/api/auth/login',{method:'POST',payload:{username:'cashier',password:'new-cashier-secret-456'}})).cookie;
  assert.equal((await write('removeUser',{username:'cashier'})).status,200);
  assert.equal((await req('/api/store',{cookie:cashierCookie})).status,401);
  const page=await fetch(base+'/');assert.equal(page.status,200);assert.match(await page.text(),/Aswaqi/);assert.ok(page.headers.get('content-security-policy'));
  const assetMiss=await fetch(base+'/missing.js');assert.equal(assetMiss.status,404);
  await app.close();app=createApp({databasePath,appUrl:origin});app.server.listen(0,'127.0.0.1');await once(app.server,'listening');base='http://127.0.0.1:'+app.server.address().port;
  const persisted=(await req('/api/store')).json;assert.equal(persisted.state.products.length,1);assert.equal(persisted.state.lots.find(x=>x.location==='shown').qty,1);
  assert.equal((await req('/api/auth/logout',{method:'POST',payload:{}})).status,200);assert.equal((await req('/api/store')).status,401);
 }finally{await app.close();rmSync(dir,{recursive:true,force:true})}
});
test('password hashing validates length and verifies without plaintext storage',async()=>{await assert.rejects(hashPassword('short'));const hash=await hashPassword('long-passphrase-123');assert.ok(!hash.includes('long-passphrase'));assert.equal(await verifyPassword('long-passphrase-123',hash),true);assert.equal(await verifyPassword('other-password-123',hash),false)});
