const enc=new TextEncoder();
export const MATERIAL_ACTOR='c43bd3c2-6e3a-4228-99c7-dc95f33643f2';
const audience='wonly-material-knowledge',path='/api/integrations/crm/knowledge';
const encode=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const decode=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const digest=async text=>encode(await crypto.subtle.digest('SHA-256',enc.encode(text)));
export async function signMaterialRequest({body,actor,privateJwk,now=Date.now()}){
 if(actor!==MATERIAL_ACTOR)throw Error('actor_denied');
 const key=await crypto.subtle.importKey('jwk',JSON.parse(privateJwk),{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
 const iat=Math.floor(now/1000);
 const claims={iss:'wonly-crm',aud:audience,sub:actor,method:'POST',path,body_sha256:await digest(body),iat,exp:iat+30,jti:crypto.randomUUID()};
 const payload=encode(enc.encode(JSON.stringify(claims)));
 const signature=encode(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,enc.encode('v1.'+payload)));
 return 'v1.'+payload+'.'+signature;
}
export async function verifyMaterialRequest({proof,body,publicJwk,now=Date.now()}){
 try{
  if(typeof proof!=='string'||proof.length>2048||!publicJwk)return null;
  const parts=proof.split('.');if(parts.length!==3||parts[0]!=='v1'||parts.slice(1).some(s=>!s||!/^[A-Za-z0-9_-]+$/.test(s)))return null;
  const jwk=JSON.parse(publicJwk);if(jwk.d)return null;
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
  if(!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,decode(parts[2]),enc.encode('v1.'+parts[1])))return null;
  const c=JSON.parse(new TextDecoder().decode(decode(parts[1]))),time=Math.floor(now/1000);
  if(c.iss!=='wonly-crm'||c.aud!==audience||c.sub!==MATERIAL_ACTOR||c.method!=='POST'||c.path!==path||!Number.isInteger(c.iat)||!Number.isInteger(c.exp)||c.exp-c.iat!==30||c.iat>time+3||c.exp<=time||typeof c.jti!=='string'||!/^[0-9a-f-]{36}$/.test(c.jti)||c.body_sha256!==await digest(body))return null;
  return c;
 }catch{return null}
}
