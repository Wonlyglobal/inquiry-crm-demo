// Refresh only an existing grant; never returns token values in the HTTP response.
export async function refreshTikTok(get,row,save,fetcher=fetch){
 if(!row?.refresh_token||!row.open_id||!get('TIKTOK_CLIENT_KEY')||!get('TIKTOK_CLIENT_SECRET'))return null;
 try{
  const r=await fetcher('https://open.tiktokapis.com/v2/oauth/token/',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_key:get('TIKTOK_CLIENT_KEY'),client_secret:get('TIKTOK_CLIENT_SECRET'),grant_type:'refresh_token',refresh_token:row.refresh_token}),redirect:'error',signal:AbortSignal.timeout(3000)});
  if(!r.ok)return null;const text=await r.text();if(text.length>20000)return null;const d=JSON.parse(text);
  const granted=new Set(String(row.scope||'').split(','));
  if(!d.access_token||d.open_id!==row.open_id||!Number.isFinite(d.expires_in)||d.expires_in<=0||String(d.scope||'').split(',').some(s=>s&&!granted.has(s)))return null;
  const next={access_token:d.access_token,refresh_token:d.refresh_token||row.refresh_token,expires_at:new Date(Date.now()+d.expires_in*1000).toISOString(),updated_at:new Date().toISOString()};
  if(!await save(next))return null;return next;
 }catch{return null}
}
