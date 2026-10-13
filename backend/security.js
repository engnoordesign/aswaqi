import {scrypt,randomBytes,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
const derive=promisify(scrypt);
export function normalizeEmail(value){if(typeof value!=='string'||value.length>254||!/^\S+@\S+\.\S+$/.test(value))throw Error('Valid email required | البريد غير صالح');return value.trim().toLowerCase()}
export function validatePassword(value){if(typeof value!=='string'||value.length<12||Buffer.byteLength(value)>512)throw Error('Password must be 12–512 characters | كلمة المرور يجب أن تكون ١٢ حرفاً على الأقل')}
export async function hashPassword(value){validatePassword(value);const salt=randomBytes(16).toString('hex');const key=await derive(value,salt,64,{N:16384,r:8,p:1});return `scrypt:${salt}:${key.toString('hex')}`}
export async function verifyPassword(value,encoded){if(typeof value!=='string'||Buffer.byteLength(value)>512)return false;try{const [algo,salt,hex]=encoded.split(':');if(algo!=='scrypt')return false;const actual=await derive(value,salt,64,{N:16384,r:8,p:1});const expected=Buffer.from(hex,'hex');return expected.length===actual.length&&timingSafeEqual(expected,actual)}catch{return false}}
export const sessionToken=()=>randomBytes(32).toString('base64url');
export const digest=token=>createHash('sha256').update(token).digest('hex');
export function cookieToken(req){const value=(req.headers.cookie||'').split(';').find(v=>v.trim().startsWith('aswaqi_session='));return value?value.trim().slice('aswaqi_session='.length):''}
