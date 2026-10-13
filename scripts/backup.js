import {openDatabase} from '../backend/database.js';
import {backupDatabase} from '../backend/backup.js';
import {argument} from './prompt.js';
const db=openDatabase(process.env.DATABASE_PATH||'./data/aswaqi.sqlite');
try{const keep=argument('keep');const {file,removed}=backupDatabase(db,keep?{keep:Number(keep)}:undefined);console.log('Consistent SQLite backup: '+file);if(removed.length)console.log(`Pruned ${removed.length} older backup(s).`)}catch(e){console.error(e.message);process.exitCode=1}finally{db.close()}
