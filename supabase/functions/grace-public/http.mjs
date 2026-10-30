import { publicHandler } from './handler.mjs';
import { accountDeletion } from './delete-account.mjs';

const forbiddenProjects = new Set(['plhverjihjilnuhlhlxi', 'rpiviiyvbpwslyxywqcd']);
const origin = 'https://crm.foreverdoodle.com';

export function createPublicHttp({ projectRef, serviceKey, anonKey, modelKey, fetcher = fetch }) {
  if (!/^[a-z]{20}$/.test(projectRef || '') || forbiddenProjects.has(projectRef)) {
    throw Error('Independent public project required');
  }
  const base = `https://${projectRef}.supabase.co`;
  async function rpc(name, userId) {
    const response = await fetcher(`${base}/rest/v1/rpc/${name}`, {
      method: 'POST', headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_user: userId }), signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw Error('Account service unavailable');
    const text=await response.text();
    return text ? JSON.parse(text) : null;
  }
  const handle = publicHandler({
    authenticate: async authorization => {
      if (!/^Bearer \S+$/.test(authorization || '')) return null;
      // A public project validates the token itself; never decode-and-trust claims.
      const response = await fetcher(`${base}/auth/v1/user`, {
        headers: { apikey: anonKey, Authorization: authorization }, signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) return null;
      const user = await response.json();
      if (!user.id || !user.email_confirmed_at || user.is_anonymous) return null;
      return { id: user.id, emailVerified: true, active: await rpc('grace_public_account', user.id) === true };
    },
    consumeQuota: id => rpc('grace_public_consume', id),
    complete: async ({ messages }) => {
      if (!modelKey) throw Error('Model is not configured');
      const response = await fetcher('https://ws-d3fxowl9v5lz3p1x.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions', {
        method: 'POST', headers: { Authorization: `Bearer ${modelKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'qwen-plus', messages, max_tokens: 1500, stream: false }),
        signal: AbortSignal.timeout(45000),
      });
      if (!response.ok) throw Error('Model unavailable');
      const result = await response.json();
      const answer = result.choices?.[0]?.message?.content;
      if (typeof answer !== 'string' || !answer.trim()) throw Error('Empty answer');
      return answer;
    },
  });
  const removeAccount=accountDeletion({base,anonKey,serviceKey,rpc,fetcher});
  return async request => {
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin' };
    const requestOrigin = request.headers.get('Origin');
    if (requestOrigin && requestOrigin !== origin) return new Response('{}', { status: 403, headers });
    if (requestOrigin) headers['Access-Control-Allow-Origin'] = origin;
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers,
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST' } });
    if (request.method !== 'POST') return new Response('{}', { status: 405, headers });
    // Bound the streamed body too: Content-Length can be absent or forged.
    let size = 0; const chunks = [];
    try {
      if (Number(request.headers.get('Content-Length')) > 100000) return new Response('{}', { status: 413, headers });
      const reader = request.body?.getReader();
      if (!reader) return new Response('{}', { status: 400, headers });
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > 100000) { await reader.cancel(); return new Response('{}', { status: 413, headers }); }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      let input;
      try { input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
      catch { return new Response('{}', { status: 400, headers }); }
      const result = await (input?.action==='account-delete' ? removeAccount : handle)(input, request.headers.get('Authorization'));
      return new Response(JSON.stringify(result), { status: result.status, headers });
    } catch {
      // Provider errors and account details must never leak to the client/logs.
      return new Response(JSON.stringify({ error: '暂时无法连接，请稍后重试' }), { status: 503, headers });
    }
  };
}
