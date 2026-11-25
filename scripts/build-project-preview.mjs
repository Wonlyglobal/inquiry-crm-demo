// Build an owner-only preview from an already prepared full runtime package.
import {cp,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const root=process.argv[2];if(!root)throw Error('Pass runtime root');
const src=path.join(root,'supabase/functions/agent-conversation'),dst=path.join(root,'supabase/functions/agent-project-preview');
await cp(src,dst,{recursive:true});
let s=await readFile(path.join(dst,'index.ts'),'utf8');

const marker="  const writing = writingInput(input);";
if(!s.includes(marker))throw Error('Preview guard anchor missing');
s=s.replace(marker,`  if(input.action!=='chat'||input.voice===true||input.persona!=='Grace'||!profile?.active||profile.role!=='owner'||user.id!==MATERIAL_ACTOR||!(factualScope(input.question,input.materialHistory||[])||companyQuestion(privateReportQuestion(input.question,input.privateReportKey))||(/^evidence-/.test(input.privateReportKey||'')&&/^(?:请|那)?(?:来源|出处|原表出处|来源与缺口|数据日期)(?:呢|吗)?[？?。]*$/.test(input.question))||(productModelClarification(input.question)||nativeProductTurn(input.question,input.materialHistory||[])&&materialFields(nativeProductTurn(input.question,input.materialHistory||[])?.question||'').some((f:string)=>['尺寸','供电','电池','材质','质保','厚度','来源'].includes(f))&&!/市场|国家|分析|写|邮件|发送|翻译/.test(input.question))||projectTurn(input.question,(input.materialHistory||[]).map((q:string)=>q.replace(/^画册检索：/,'')))))return json({error:'此预览仅供原授权账号测试企业、参数与案例问答'},403);\n`+marker);
s=s.replace(" const watchSecret=req.headers.get('x-watch-secret');"," if(req.headers.has('x-watch-secret'))return json({error:'forbidden'},403);\n const watchSecret=req.headers.get('x-watch-secret');");
await writeFile(path.join(dst,'index.ts'),s);
