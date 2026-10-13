import {openDatabase,getStore} from '../backend/database.js';
import {createOwner} from '../backend/owner.js';
import {normalizeEmail} from '../backend/security.js';
import {prompt,argument,newPassword} from './prompt.js';
const db=openDatabase(process.env.DATABASE_PATH||'./data/aswaqi.sqlite');
try{if(getStore(db))throw Error('Store already initialized. Use password:reset if needed.');const email=normalizeEmail(argument('email')||await prompt('Owner email / بريد المالك: '));const password=await newPassword('Password (12+ characters) / كلمة المرور: ');await createOwner(db,email,password);console.log('Owner created. Start the server and sign in. / تم إنشاء المالك.')}catch(e){console.error(e.message);process.exitCode=1}finally{db.close()}
