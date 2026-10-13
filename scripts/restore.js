// Restore a SQLite snapshot made by scripts/backup.js. STOP THE SERVER FIRST.
//   node scripts/restore.js --from backups/aswaqi-....sqlite [--yes]
// The current database (and its -wal/-shm files) is moved aside to data/pre-restore-<time>/.
import {DatabaseSync} from 'node:sqlite';
import {existsSync,mkdirSync,renameSync,copyFileSync,chmodSync} from 'node:fs';
import {resolve,dirname,join,basename} from 'node:path';
import {openDatabase,getStore} from '../backend/database.js';
import {argument,flag,prompt} from './prompt.js';
try{
 const from=argument('from');if(!from)throw Error('Usage: node scripts/restore.js --from <snapshot.sqlite> [--yes]');
 const source=resolve(from),target=resolve(process.env.DATABASE_PATH||'./data/aswaqi.sqlite');
 if(!existsSync(source))throw Error('Snapshot not found: '+source);
 const snapshot=new DatabaseSync(source,{readOnly:true});
 let users=0;
 try{const check=snapshot.prepare('PRAGMA integrity_check').get();if(Object.values(check)[0]!=='ok')throw Error('Snapshot failed integrity check');const store=getStore(snapshot);if(!store)throw Error('Snapshot has no Aswaqi store');users=snapshot.prepare('SELECT count(*) n FROM credentials').get().n}
 finally{snapshot.close()}
 console.log(`Snapshot OK: ${basename(source)} (${users} account(s)).`);
 console.log('Make sure the Aswaqi server is stopped (docker compose stop aswaqi).');
 if(!flag('yes')&&(await prompt('Type RESTORE to replace the current database: '))!=='RESTORE')throw Error('Cancelled');
 const aside=join(dirname(target),'pre-restore-'+new Date().toISOString().replaceAll(':','-'));
 let moved=0;for(const suffix of ['','-wal','-shm']){if(existsSync(target+suffix)){mkdirSync(aside,{recursive:true,mode:0o700});renameSync(target+suffix,join(aside,basename(target)+suffix));moved++}}
 mkdirSync(dirname(target),{recursive:true,mode:0o700});copyFileSync(source,target);chmodSync(target,0o600);
 const db=openDatabase(target);try{if(!getStore(db))throw Error('Restored database could not be read')}finally{db.close()}
 console.log(`Restored to ${target}.${moved?` Previous database kept in ${aside}.`:''} Start the server again.`);
}catch(e){console.error(e.message);process.exitCode=1}
