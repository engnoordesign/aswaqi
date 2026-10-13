import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,chmodSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
export function openDatabase(filename){const path=resolve(filename);mkdirSync(dirname(path),{recursive:true,mode:0o700});const db=new DatabaseSync(path);chmodSync(path,0o600);db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS store(id TEXT PRIMARY KEY, data TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS credentials(username TEXT PRIMARY KEY,password_hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,username TEXT NOT NULL REFERENCES credentials(username) ON DELETE CASCADE,expires INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS session_expiry ON sessions(expires);`);migrate(db);return db}
/** Databases created by older versions identified accounts by email; rename those columns and fields to username. Existing logins keep working. */
function migrate(db){const columns=table=>db.prepare(`PRAGMA table_info(${table})`).all().map(c=>c.name);
 if(columns('credentials').includes('email'))db.exec('ALTER TABLE credentials RENAME COLUMN email TO username');
 if(columns('sessions').includes('email'))db.exec('ALTER TABLE sessions RENAME COLUMN email TO username');
 const row=db.prepare('SELECT data FROM store WHERE id=?').get('main');if(!row)return;const state=JSON.parse(row.data);
 if(Array.isArray(state.users)&&state.users.some(u=>'email' in u)){state.users=state.users.map(({email,...u})=>({username:u.username??email,...u}));db.prepare('UPDATE store SET data=? WHERE id=?').run(JSON.stringify(state),'main')}}
export function getStore(db){const row=db.prepare('SELECT data,revision FROM store WHERE id=?').get('main');return row?{state:JSON.parse(row.data),revision:row.revision}:null}
export function transaction(db,fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result}catch(error){db.exec('ROLLBACK');throw error}}
