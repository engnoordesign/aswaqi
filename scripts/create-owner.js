// Optional: create the first manager from the terminal instead of the browser setup screen.
import {openDatabase,getStore} from '../backend/database.js';
import {createOwner} from '../backend/owner.js';
import {normalizeUsername} from '../backend/security.js';
import {prompt,argument,newPassword} from './prompt.js';
const db=openDatabase(process.env.DATABASE_PATH||'./data/aswaqi.sqlite');
try{if(getStore(db))throw Error('Store already initialized. Use password:reset if needed.');const username=normalizeUsername(argument('username')||await prompt('Manager username / اسم المستخدم للمدير: '));const password=await newPassword('Password (12+ characters) / كلمة المرور: ');await createOwner(db,username,password);console.log(`Manager "${username}" created. Start Aswaqi and sign in. / تم إنشاء المدير.`)}catch(e){console.error(e.message);process.exitCode=1}finally{db.close()}
