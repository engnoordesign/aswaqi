import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,chmodSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
export function openDatabase(filename){const path=resolve(filename);mkdirSync(dirname(path),{recursive:true,mode:0o700});const db=new DatabaseSync(path);chmodSync(path,0o600);db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS store(id TEXT PRIMARY KEY, data TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS credentials(email TEXT PRIMARY KEY,password_hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,email TEXT NOT NULL REFERENCES credentials(email) ON DELETE CASCADE,expires INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS session_expiry ON sessions(expires);`);return db}
export function getStore(db){const row=db.prepare('SELECT data,revision FROM store WHERE id=?').get('main');return row?{state:JSON.parse(row.data),revision:row.revision}:null}
export function transaction(db,fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result}catch(error){db.exec('ROLLBACK');throw error}}
