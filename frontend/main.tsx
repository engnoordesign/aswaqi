import React,{useState,useEffect,useCallback} from 'react';
import {createRoot} from 'react-dom/client';
import {ShoppingBasket,ShieldCheck,Globe,KeyRound,X,ArrowRight,Store} from 'lucide-react';
import App from './App';
import './styles.css';

const post=async(url:string,payload:unknown)=>{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Server unavailable · الخادم غير متاح');return d};
const usernameHint={en:'3–64 letters or numbers, no spaces',ar:'من ٣ إلى ٦٤ حرفاً أو رقماً بدون مسافات'};

function Root(){
 const [ready,setReady]=useState<boolean|null>(null),[setup,setSetup]=useState(false),[lang,setLang]=useState(localStorage.getItem('aswaqi-language')||'en'),[error,setError]=useState(''),[busy,setBusy]=useState(false),[change,setChange]=useState(false);
 const ar=lang==='ar',t=(en:string,a:string)=>ar?a:en;

 useEffect(()=>{(async()=>{try{
  const s=await fetch('/api/setup');if(!s.ok)throw Error('Server unavailable · الخادم غير متاح');
  if((await s.json()).needed){setSetup(true);setReady(false);return}
  const r=await fetch('/api/store');if(r.status===401){setReady(false);return}if(!r.ok)throw Error('Server unavailable · الخادم غير متاح');setReady(true);
 }catch(e){setError((e as Error).message);setReady(false)}})()},[]);

 const logout=useCallback(async()=>{await fetch('/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).catch(()=>{});setReady(false);setChange(false);setLang(localStorage.getItem('aswaqi-language')||'en')},[]);

 async function login(e:React.FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setError('');try{await post('/api/auth/login',Object.fromEntries(new FormData(e.currentTarget)));setReady(true)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 async function createManager(e:React.FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setError('');const p=Object.fromEntries(new FormData(e.currentTarget));try{if(p.password!==p.confirmPassword)throw Error(t('Passwords do not match','كلمتا المرور غير متطابقتين'));await post('/api/setup',{storeName:p.storeName,username:p.username,password:p.password});setSetup(false);setReady(true)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 async function password(e:React.FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setError('');const p=Object.fromEntries(new FormData(e.currentTarget));try{if(p.newPassword!==p.confirmPassword)throw Error(t('Passwords do not match','كلمتا المرور غير متطابقتين'));await post('/api/auth/password',p);setChange(false);setReady(false);setError(t('Password changed. Sign in again.','تم تغيير كلمة المرور. سجّل دخولك مجدداً.'))}catch(e){setError((e as Error).message)}finally{setBusy(false)}}

 if(ready===null)return <div className="loading"><ShoppingBasket size={40}/><h2>aswaqi · أسواقي</h2></div>;

 if(!ready){
  const usernameField=<label className="field">{t('Username','اسم المستخدم')}<input name="username" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} required minLength={3} maxLength={64} pattern="[^\s]{3,64}" title={ar?usernameHint.ar:usernameHint.en} placeholder={setup?'admin':''}/></label>;
  const form=setup
   ?<form onSubmit={createManager}><span className="login-lock"><Store size={27}/></span><h2>{t('Set up your store','إعداد متجرك')}</h2><p>{t('Create the manager account. You will use it to sign in and to add your staff.','أنشئ حساب المدير. ستستخدمه لتسجيل الدخول ولإضافة الموظفين.')}</p>
     <label className="field">{t('Store name (optional)','اسم المتجر (اختياري)')}<input name="storeName" type="text" maxLength={120} placeholder="Aswaqi · أسواقي"/></label>
     {usernameField}
     <label className="field">{t('Password (12+ characters)','كلمة المرور (١٢ حرفاً على الأقل)')}<input name="password" type="password" autoComplete="new-password" minLength={12} required/></label>
     <label className="field">{t('Confirm password','تأكيد كلمة المرور')}<input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} required/></label>
     {error&&<div className="warning" role="alert">{error}</div>}
     <button className="primary complete" disabled={busy}>{busy?t('Creating…','جارٍ الإنشاء…'):t('Create manager & open store','إنشاء المدير وفتح المتجر')}<ArrowRight size={17}/></button>
     <p className="login-hint">{t('Keep this password safe. It can be reset later from the server computer.','احفظ كلمة المرور في مكان آمن. يمكن إعادة تعيينها لاحقاً من جهاز الخادم.')}</p></form>
   :<form onSubmit={login}><span className="login-lock"><ShieldCheck size={27}/></span><h2>{t('Welcome back','أهلاً بعودتك')}</h2><p>{t('Sign in to your Aswaqi workspace.','سجّل دخولك إلى مساحة أسواقي.')}</p>
     {usernameField}
     <label className="field">{t('Password','كلمة المرور')}<input name="password" type="password" autoComplete="current-password" required/></label>
     {error&&<div className="warning" role="alert">{error}</div>}
     <button className="primary complete" disabled={busy}>{busy?t('Signing in…','جارٍ الدخول…'):t('Sign in','تسجيل الدخول')}<ArrowRight size={17}/></button>
     <p className="login-hint">{t('Need an account? Ask your store manager.','تحتاج حساباً؟ تواصل مع مدير المتجر.')}</p></form>;
  return <div className="login-screen" dir={ar?'rtl':'ltr'}><div className="login-art"><div className="brand"><div className="brandmark"><ShoppingBasket/></div><div>aswaqi<span>أسواقي</span></div></div><div className="login-intro"><span className="eyebrow">{t('YOUR STORE. BEAUTIFULLY CONNECTED.','متجرك. مترابط بكل سلاسة.')}</span><h1>{t('One store.','متجر واحد.')}<br/>{t('Endless possibilities.','إمكانيات متكاملة.')}</h1><p>{t('Sales, inventory and accounting in one simple workspace.','المبيعات والمخزون والمحاسبة في مساحة عمل واحدة بسيطة.')}</p><div className="login-orbit"><ShoppingBasket size={100} strokeWidth={1}/></div></div><small>Aswaqi · Supermarket management · إدارة السوبرماركت</small></div><div className="login-form"><button className="language login-language" onClick={()=>{const v=ar?'en':'ar';setLang(v);localStorage.setItem('aswaqi-language',v)}}><Globe size={16}/>{ar?'English':'العربية'}</button>{form}</div></div>;
 }

 return <><App onSignOut={logout}/><button className="password-button" title="Change password · تغيير كلمة المرور" onClick={()=>{setLang(localStorage.getItem('aswaqi-language')||'en');setError('');setChange(true)}}><KeyRound size={16}/></button>{change&&<div className="overlay"><section className="modal" dir={ar?'rtl':'ltr'}><div className="panelhead"><h2>{t('Change password','تغيير كلمة المرور')}</h2><button className="iconbtn" onClick={()=>setChange(false)}><X size={20}/></button></div><form onSubmit={password}><div className="modalbody"><label className="field">{t('Current password','كلمة المرور الحالية')}<input name="currentPassword" type="password" autoComplete="current-password" required/></label><label className="field">{t('New password (12+ characters)','كلمة المرور الجديدة (١٢ حرفاً على الأقل)')}<input name="newPassword" type="password" autoComplete="new-password" minLength={12} required/></label><label className="field">{t('Confirm password','تأكيد كلمة المرور')}<input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} required/></label>{error&&<div className="warning">{error}</div>}<button className="primary" disabled={busy}>{t('Save & sign in again','حفظ وإعادة تسجيل الدخول')}</button></div></form></section></div>}</>;
}
createRoot(document.getElementById('root')!).render(<Root/>);
