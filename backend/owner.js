import {readFileSync} from 'node:fs';
import {getStore,transaction} from './database.js';
import {normalizeUsername,hashPassword} from './security.js';
import {initial} from '../shared/engine.js';

/** Create the first manager and an empty store. Fails if the store already exists. */
export async function createOwner(db,username,password,storeName){
 if(getStore(db))throw Error('Store already initialized. Use password:reset if needed.');
 const name=normalizeUsername(username);const hash=await hashPassword(password);
 transaction(db,()=>{
  if(getStore(db))throw Error('Store already initialized.');
  const state=initial(name);
  if(typeof storeName==='string'&&storeName.trim())state.settings.name=storeName.trim().slice(0,120);
  db.prepare('INSERT INTO credentials(username,password_hash) VALUES(?,?)').run(name,hash);
  db.prepare('INSERT INTO store(id,data,revision) VALUES(?,?,0)').run('main',JSON.stringify(state));
 });
 return name;
}

/** Read a secret from VAR_FILE (Docker secrets) or VAR. */
export function secret(name,env=process.env){
 const file=env[name+'_FILE'];
 if(file)return readFileSync(file,'utf8').replace(/\r?\n$/,'');
 return env[name];
}

/**
 * Optional unattended first-run setup (Docker/remote panels): when the store is empty and
 * OWNER_USERNAME plus OWNER_PASSWORD (or OWNER_PASSWORD_FILE) are set, create the manager.
 * Without these variables the first manager is created from the browser setup screen.
 * Does nothing once a store exists, so the variables can safely stay set.
 */
export async function bootstrapOwner(db,env=process.env,log=console){
 if(getStore(db))return null;
 const username=env.OWNER_USERNAME||env.OWNER_EMAIL,password=secret('OWNER_PASSWORD',env);
 if(!username||!password){log.log('No store yet. Open Aswaqi in your browser to create the first manager account.');return null}
 const name=await createOwner(db,username,password);
 log.log(`First manager created: ${name}. Remove OWNER_PASSWORD / the owner_password secret now that setup is done.`);
 return name;
}
