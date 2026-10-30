// Public signup never creates a CRM profile or writes roles/member metadata.
export function registrationInput({email,password,confirmPassword,acceptedTerms}){
 const normalized=String(email||'').trim().toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)||normalized.length>254)throw Error('请输入有效邮箱');
 if(typeof password!=='string'||password.length<12||password.length>128)throw Error('密码需为12至128个字符');
 if(password!==confirmPassword)throw Error('两次密码不一致');
 if(acceptedTerms!==true)throw Error('请阅读并同意用户协议与隐私说明');
 return {email:normalized,password};
}
export function createPublicRegistration({auth,redirectTo}){
 const redirect=new URL(redirectTo);
 if(redirect.origin!=='https://crm.foreverdoodle.com'||!['/grace.html','/grace-app.html'].includes(redirect.pathname)||redirect.search||redirect.hash)throw Error('注册回跳地址不允许');
 let busy=false;
 return async function register(values){
  if(busy)throw Error('正在提交，请稍候');
  const input=registrationInput(values);busy=true;
  try{
   const {error}=await auth.signUp({...input,options:{emailRedirectTo:redirect.href}});
   if(error)throw Error('注册暂未成功，请稍后重试；已有账号请直接登录');
   // Same message for an existing account avoids account enumeration.
   return {status:'verification-required',message:'请查看邮箱并完成验证；已有账号可直接登录。'};
  }finally{busy=false}
 };
}
export function mountPublicRegistration(host,register){
 host.innerHTML=`<form class="grace-registration"><h2>创建 Grace 账号</h2><p>注册即可使用通用问答。企业资料需要另外授权。</p><label>邮箱<input name="email" type="email" autocomplete="email" required></label><label>密码<input name="password" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label><label>确认密码<input name="confirmPassword" type="password" autocomplete="new-password" required></label><label><input name="acceptedTerms" type="checkbox" required>我已阅读并同意<a href="/grace-terms.html" target="_blank" rel="noopener">用户协议</a>与<a href="/grace-privacy.html" target="_blank" rel="noopener">隐私说明</a></label><button type="submit">注册</button><p role="status" aria-live="polite"></p></form>`;
 const form=host.querySelector('form'),button=form.querySelector('button'),status=form.querySelector('[role=status]');
 form.addEventListener('submit',async event=>{event.preventDefault();if(button.disabled)return;button.disabled=true;status.textContent='正在提交…';const data=new FormData(form);try{const result=await register({email:data.get('email'),password:data.get('password'),confirmPassword:data.get('confirmPassword'),acceptedTerms:data.get('acceptedTerms')==='on'});status.textContent=result.message;form.querySelectorAll('input[type=password]').forEach(input=>input.value='')}catch(error){status.textContent=error.message||'暂时无法注册'}finally{button.disabled=false}});
 return form;
}
