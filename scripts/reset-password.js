import {openDatabase,transaction} from '../backend/database.js';
import {normalizeEmail,hashPassword} from '../backend/security.js';
import {prompt,argument,newPassword} from './prompt.js';
const db=openDatabase(process.env.DATABASE_PATH||'./data/aswaqi.sqlite');
try{const email=normalizeEmail(argument('email')||await prompt('Account email: '));if(!db.prepare('SELECT email FROM credentials WHERE email=?').get(email))throw Error('Account not found');const password=await newPassword('New password (12+ characters): ');const hash=await hashPassword(password);transaction(db,()=>{db.prepare('UPDATE credentials SET password_hash=? WHERE email=?').run(hash,email);db.prepare('DELETE FROM sessions WHERE email=?').run(email)});console.log('Password reset; existing sessions revoked.')}catch(e){console.error(e.message);process.exitCode=1}finally{db.close()}
