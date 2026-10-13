import {openDatabase,transaction} from '../backend/database.js';
import {normalizeUsername,hashPassword} from '../backend/security.js';
import {prompt,argument,newPassword} from './prompt.js';
const db=openDatabase(process.env.DATABASE_PATH||'./data/aswaqi.sqlite');
try{const username=normalizeUsername(argument('username')||await prompt('Username / اسم المستخدم: '));if(!db.prepare('SELECT username FROM credentials WHERE username=?').get(username))throw Error('Account not found / الحساب غير موجود');const password=await newPassword('New password (12+ characters) / كلمة المرور الجديدة: ');const hash=await hashPassword(password);transaction(db,()=>{db.prepare('UPDATE credentials SET password_hash=? WHERE username=?').run(hash,username);db.prepare('DELETE FROM sessions WHERE username=?').run(username)});console.log('Password reset; existing sessions revoked. / تمت إعادة تعيين كلمة المرور.')}catch(e){console.error(e.message);process.exitCode=1}finally{db.close()}
