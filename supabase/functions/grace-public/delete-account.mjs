// Deletion derives identity from verified Auth and fresh password authentication.
// Never accept a target user ID/email supplied by the client.
export function accountDeletion({base, anonKey, serviceKey, rpc, fetcher}) {
  return async (input, authorization) => {
    const denied = {status:401,error:'请重新验证密码后再删除账号'};
    if (!input || input.confirm !== 'DELETE' || typeof input.password !== 'string' ||
        input.password.length < 1 || input.password.length > 128 ||
        Object.keys(input).some(k=>!['action','confirm','password'].includes(k))) {
      return {status:400,error:'请确认删除并输入当前密码'};
    }
    if (!/^Bearer \S+$/.test(authorization || '')) return denied;
    const auth = await fetcher(`${base}/auth/v1/user`, {
      headers:{apikey:anonKey,Authorization:authorization},signal:AbortSignal.timeout(10000),
    });
    if (!auth.ok) return denied;
    const user=await auth.json();
    if (!user.id || !user.email || !user.email_confirmed_at || user.is_anonymous) return denied;
    const reauth=await fetcher(`${base}/auth/v1/token?grant_type=password`, {
      method:'POST',headers:{apikey:anonKey,'Content-Type':'application/json'},
      body:JSON.stringify({email:user.email,password:input.password}),signal:AbortSignal.timeout(10000),
    });
    if (!reauth.ok) return denied;
    const fresh=await reauth.json();
    if (fresh.user?.id !== user.id) return denied;
    // A partially failed deletion remains blocked from AI and can retry deletion.
    await rpc('grace_public_disable',user.id);
    const deletion=await fetcher(`${base}/auth/v1/admin/users/${encodeURIComponent(user.id)}`, {
      method:'DELETE',headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`},
      signal:AbortSignal.timeout(10000),
    });
    if (!deletion.ok) return {status:503,error:'账号已停用，删除尚未完成，请稍后重试删除'};
    return {status:200,deleted:true};
  };
}
