// Resolve the verified user before any service-role access or external side effect.
// Never infer write permission from client-decoded claims or editable user metadata.
export function withReadOnlyGuard(handler: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    const runHandler = async () => { const result = await handler(req); result.headers.set('X-CRM-Permission-Guard','20260916'); return result; };
    if (req.method === 'OPTIONS') return runHandler();
    const authorization = req.headers.get('Authorization') || '';
    if (!authorization) return runHandler(); // Original handler retains its auth policy.
    const token = authorization.replace(/^Bearer\s+/i, '');
    const envKey = (group: string, legacy: string) => {
      try { return JSON.parse(Deno.env.get(group) || '{}').default || Deno.env.get(legacy) || ''; }
      catch { return Deno.env.get(legacy) || ''; }
    };
    const service = envKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY');
    const legacyService = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if ((service && token === service) || (legacyService && token === legacyService)) return runHandler();
    const headers = {'Access-Control-Allow-Origin':'*','Content-Type':'application/json','X-CRM-Permission-Guard':'20260916'};
    try {
      const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/user`, {
        headers:{Authorization:authorization,apikey:envKey('SUPABASE_PUBLISHABLE_KEYS','SUPABASE_ANON_KEY')},
        signal:AbortSignal.timeout(10000),
      });
      if (!response.ok) return new Response(JSON.stringify({error:'登录状态无效'}),{status:401,headers});
      const user = await response.json();
      if (user.role === 'crm_marketing_readonly' || user.app_metadata?.crm_read_only === true) {
        return new Response(JSON.stringify({error:'市场部只读账号不能执行此操作'}), {
          status:403,headers,
        });
      }
      return runHandler();
    } catch {
      return new Response(JSON.stringify({error:'暂时无法验证操作权限，请稍后重试'}),{status:503,headers});
    }
  };
}
