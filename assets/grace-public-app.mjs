import { publicConfig } from './grace-public-config.mjs';
import { createPublicRegistration, mountPublicRegistration } from './grace-registration.mjs';
const $=selector=>document.querySelector(selector);
const status=$('#status'), authDialog=$('#auth'), settings=$('#settings');
let client, user, registration=false, busy=false, consent=false;
const history=[];
const forbidden=new Set(['plhverjihjilnuhlhlxi','rpiviiyvbpwslyxywqcd']);
function say(text){status.textContent=text}
function openAuth(){renderAuth();authDialog.showModal()}
function renderAuth(){
 const host=$('#auth-content');
 $('#auth-toggle').textContent=registration?'已有账号？登录':'还没有账号？注册';
 if(registration){mountPublicRegistration(host,createPublicRegistration({auth:client.auth,redirectTo:'https://crm.foreverdoodle.com/grace-app.html'}));return}
 host.innerHTML='<form><h2>你好，我是 Grace</h2><label>邮箱<input name="email" type="email" autocomplete="email" required></label><label>密码<input name="password" type="password" autocomplete="current-password" required></label><button type="submit">登录 Grace</button><button type="button" id="forgot" class="text-button">忘记密码</button><p role="status"></p></form>';
 host.querySelector('#forgot').addEventListener('click',async()=>{const email=host.querySelector('[name=email]').value.trim(),message=host.querySelector('[role=status]');if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){message.textContent='请先填写邮箱';return}const button=host.querySelector('#forgot');button.disabled=true;try{const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:'https://crm.foreverdoodle.com/grace-app.html'});message.textContent=error?'暂时无法发送，请稍后重试':'如果该邮箱已注册，你将收到密码重置邮件。'}catch{message.textContent='网络连接失败，请重试'}finally{button.disabled=false}});
 host.querySelector('form').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget,button=form.querySelector('button'),message=form.querySelector('[role=status]');
  if(button.disabled)return;button.disabled=true;message.textContent='正在登录…';
  try {const data=new FormData(form);const result=await client.auth.signInWithPassword({email:String(data.get('email')).trim(),password:String(data.get('password'))});
   if(result.error||!result.data.user)throw Error('请检查邮箱、密码及邮箱验证状态');
   user=result.data.user;form.reset();authDialog.close();say('');
  }catch(error){message.textContent=error.message||'暂时无法登录'}finally{button.disabled=false}
 });
}
function append(role,text){const p=document.createElement('p');p.className=`message ${role}`;p.textContent=text;$('#messages').append(p);document.body.classList.add('has-messages');p.scrollIntoView({block:'end',behavior:'smooth'})}
function clearConversation(){history.length=0;$('#messages').replaceChildren();document.body.classList.remove('has-messages');consent=false}
for(const dialog of [authDialog,settings,$('#delete-dialog')])dialog.querySelector('.close').addEventListener('click',()=>dialog.close());
$('#auth-toggle').addEventListener('click',()=>{registration=!registration;renderAuth()});
$('#account').addEventListener('click',()=>{if(!client)return say('公众服务正在配置，请稍后再试');if(!user)return openAuth();$('#identity').textContent=user.email;settings.showModal()});
$('#logout').addEventListener('click',async()=>{if(busy)return say('请等待本次回答结束后退出');const result=await client.auth.signOut();if(result.error)return say('退出未完成，请重试');user=null;clearConversation();settings.close();say('已退出登录')});
$('#delete-open').addEventListener('click',()=>{if(busy)return say('请等待本次回答结束');settings.close();$('#delete-form').reset();$('#delete-form [role=status]').textContent='';$('#delete-dialog').showModal()});
$('#delete-form').addEventListener('submit',async event=>{
 event.preventDefault();const form=event.currentTarget,button=form.querySelector('button[type=submit]'),message=form.querySelector('[role=status]');if(button.disabled||busy)return;
 button.disabled=true;message.textContent='正在验证并删除…';
 try{const data=new FormData(form);if(data.get('confirmed')!=='on')return;const {data:{session}}=await client.auth.getSession();if(!session)throw Error('请先重新登录');
 const response=await fetch(`https://${publicConfig.projectRef}.supabase.co/functions/v1/grace-public`,{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`,apikey:publicConfig.anonKey,'Content-Type':'application/json'},body:JSON.stringify({action:'account-delete',confirm:'DELETE',password:String(data.get('password'))}),signal:AbortSignal.timeout(45000)});
 const result=await response.json();if(!response.ok||result.deleted!==true)throw Error(result.error||'删除未完成，请重试');
 await client.auth.signOut({scope:'local'});user=null;clearConversation();form.reset();$('#delete-dialog').close();say('公众账号已删除');
 }catch(error){message.textContent=error.message||'删除未完成，请重试'}finally{form.querySelector('[name=password]').value='';button.disabled=false}
});
$('#recovery-form').addEventListener('submit',async event=>{
 event.preventDefault();const form=event.currentTarget,data=new FormData(form),button=form.querySelector('button'),message=form.querySelector('[role=status]');
 if(button.disabled)return;if(data.get('password')!==data.get('confirm')){message.textContent='两次密码不一致';return}button.disabled=true;
 try{const {error}=await client.auth.updateUser({password:String(data.get('password'))});if(error)throw Error('密码更新未完成，请重新打开重置邮件后再试');form.reset();$('#recovery').close();say('密码已更新')}catch(error){message.textContent=error.message}finally{button.disabled=false}
});
$('#agree').addEventListener('click',()=>{consent=true;$('#consent').close();$('#composer').requestSubmit()});
$('#decline').addEventListener('click',()=>$('#consent').close());
$('#composer').addEventListener('submit',async event=>{
 event.preventDefault();if(busy)return;if(!client)return say('公众服务正在配置，请稍后再试');if(!user)return openAuth();
 const question=$('#question').value.trim();if(!question)return;
 if(!consent)return $('#consent').showModal();
 const requestUser=user.id;
 busy=true;$('#composer button').disabled=true;$('.grace-orb').className='grace-orb think';say('正在思考…');
 try {
  const {data:{session}}=await client.auth.getSession();if(!session){user=null;openAuth();return}
  const response=await fetch(`https://${publicConfig.projectRef}.supabase.co/functions/v1/grace-public`,{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`,apikey:publicConfig.anonKey,'Content-Type':'application/json'},body:JSON.stringify({action:'chat',question,history:history.slice(-20)}),signal:AbortSignal.timeout(55000)});
  const result=await response.json();if(!response.ok){if(response.status===401){user=null;openAuth()}throw Error(result.error||'暂时无法回答')}
  if(user?.id!==requestUser)return;
  if(typeof result.answer!=='string')throw Error('回答格式异常，请重试');
  append('user',question);append('assistant',result.answer);history.push({role:'user',content:question},{role:'assistant',content:result.answer});
  while(history.reduce((n,x)=>n+x.content.length,0)>20000||history.length>20)history.splice(0,2);
  $('#question').value='';say('');
 }catch(error){say(error.name==='TimeoutError'?'等待超时，请稍后重试':error.message||'网络连接失败，请重试')}finally{busy=false;$('#composer button').disabled=false;$('.grace-orb').className='grace-orb idle'}
});
async function start(){
 if(!/^[a-z]{20}$/.test(publicConfig.projectRef)||forbidden.has(publicConfig.projectRef)||!publicConfig.anonKey){say('公众服务尚未开通；企业用户可使用已有入口。');return}
 try{
  const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2.57.4');
  client=createClient(`https://${publicConfig.projectRef}.supabase.co`,publicConfig.anonKey,{auth:{storageKey:'grace-public-auth',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  client.auth.onAuthStateChange((event,session)=>{if(event==='PASSWORD_RECOVERY')$('#recovery').showModal();const previous=user?.id;user=session?.user||null;if(previous&&previous!==user?.id)clearConversation()});
  const {data,error}=await client.auth.getUser();if(!error)user=data.user;
  say('');
 }catch{say('连接失败，请重新打开 Grace')}
}
start();
