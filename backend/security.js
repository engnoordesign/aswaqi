import {scrypt,randomBytes,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
const derive=promisify(scrypt);
/** Usernames: 3–64 letters (any language), digits, dot, dash, underscore or @. Case-insensitive. */
export const USERNAME_PATTERN=/^[\p{L}\p{N}][\p{L}\p{N}._@-]{2,63}$/u;
export function normalizeUsername(value){const name=typeof value==='string'?value.trim().toLowerCase():'';if(!USERNAME_PATTERN.test(name))throw Error('Username must be 3–64 letters or numbers (. _ - allowed), no spaces | اسم المستخدم من ٣ إلى ٦٤ حرفاً أو رقماً بدون مسافات');return name}
export function validatePassword(value){if(typeof value!=='string'||value.length<12||Buffer.byteLength(value)>512)throw Error('Password must be 12–512 characters | كلمة المرور يجب أن تكون ١٢ حرفاً على الأقل')}
export async function hashPassword(value){validatePassword(value);const salt=randomBytes(16).toString('hex');const key=await derive(value,salt,64,{N:16384,r:8,p:1});return `scrypt:${salt}:${key.toString('hex')}`}
export async function verifyPassword(value,encoded){if(typeof value!=='string'||Buffer.byteLength(value)>512)return false;try{const [algo,salt,hex]=encoded.split(':');if(algo!=='scrypt')return false;const actual=await derive(value,salt,64,{N:16384,r:8,p:1});const expected=Buffer.from(hex,'hex');return expected.length===actual.length&&timingSafeEqual(expected,actual)}catch{return false}}
export const sessionToken=()=>randomBytes(32).toString('base64url');
export const digest=token=>createHash('sha256').update(token).digest('hex');
export function cookieToken(req){const value=(req.headers.cookie||'').split(';').find(v=>v.trim().startsWith('aswaqi_session='));return value?value.trim().slice('aswaqi_session='.length):''}
