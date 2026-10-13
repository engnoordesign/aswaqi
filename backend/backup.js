import {mkdirSync,readdirSync,unlinkSync} from 'node:fs';
import {resolve,join} from 'node:path';

const PATTERN=/^aswaqi-.+\.sqlite$/;

/** Write a consistent SQLite snapshot with VACUUM INTO and prune old snapshots. */
export function backupDatabase(db,{dir=process.env.BACKUP_DIR||'backups',keep=Number(process.env.BACKUP_KEEP||0)}={}){
 const target=resolve(dir);mkdirSync(target,{recursive:true,mode:0o700});
 const file=join(target,'aswaqi-'+new Date().toISOString().replaceAll(':','-')+'.sqlite');
 db.prepare('VACUUM INTO ?').run(file);
 const removed=keep>0?prune(target,keep):[];
 return {file,removed};
}

/** Keep the newest `keep` snapshots (names sort chronologically). */
export function prune(dir,keep){
 const files=readdirSync(dir).filter(name=>PATTERN.test(name)).sort();
 const old=files.slice(0,Math.max(0,files.length-keep));
 for(const name of old)unlinkSync(join(dir,name));
 return old;
}

/** Run backups on an interval inside the server process. Returns a stop function. */
export function scheduleBackups(db,{hours=Number(process.env.BACKUP_INTERVAL_HOURS||0),log=console}={}){
 if(!Number.isFinite(hours)||hours<=0)return ()=>{};
 if(hours<0.1)throw Error('BACKUP_INTERVAL_HOURS must be at least 0.1');
 const run=()=>{try{const {file,removed}=backupDatabase(db);log.log(`Backup written: ${file}${removed.length?` (pruned ${removed.length})`:''}`)}catch(error){log.error('Scheduled backup failed: '+error.message)}};
 const timer=setInterval(run,hours*3600000);timer.unref();
 log.log(`Automatic backups every ${hours}h to ${resolve(process.env.BACKUP_DIR||'backups')}${Number(process.env.BACKUP_KEEP)>0?`, keeping ${process.env.BACKUP_KEEP}`:''}`);
 return ()=>clearInterval(timer);
}
