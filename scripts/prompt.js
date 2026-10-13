import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
export async function prompt(label,hidden=false){if(!process.stdin.isTTY)throw Error('Use an interactive terminal to enter credentials securely, or pass --password-stdin.');let mute=false;const output=new Writable({write(chunk,encoding,callback){if(!mute)process.stdout.write(chunk,encoding);callback()}});const rl=createInterface({input:process.stdin,output,terminal:true});process.stdout.write(label);mute=hidden;try{const answer=await rl.question('');if(hidden)process.stdout.write('\n');return answer}finally{rl.close()}}
export const argument=(key)=>{const idx=process.argv.indexOf('--'+key);return idx>=0?process.argv[idx+1]:undefined};
export const flag=(key)=>process.argv.includes('--'+key);
/** Read a password piped on stdin (first line), e.g. `printf '%s' "$PW" | ... --password-stdin`. */
export async function stdinPassword(){let data='';for await(const chunk of process.stdin)data+=chunk;const value=data.split(/\r?\n/)[0];if(!value)throw Error('No password received on stdin');return value}
/** Ask twice on a TTY, or read once from stdin with --password-stdin. */
export async function newPassword(label){if(flag('password-stdin'))return stdinPassword();const password=await prompt(label,true);if(password!==await prompt('Confirm password / تأكيد: ',true))throw Error('Passwords do not match');return password}
