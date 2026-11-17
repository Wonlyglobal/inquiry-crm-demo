// Local, read-only extraction. No model call and no persisted replacement of source evidence.
export function chineseInquirySummary(row){
 const raw=String(row.original_message||'').trim(),saved=String(row.demand_summary||'').trim();
 if(saved&&/[\u3400-\u9fff]/u.test(saved)&&!/[A-Za-z]{12}/.test(saved))return {text:saved,source:'已录入中文摘要'};
 const message=raw.match(/(?:^|\n)\s*message\s*[:：]\s*([\s\S]*?)(?=\n\s*(?:source|journey|user_journey|page_url|recipient)\s*[:：]|$)/i)?.[1]||raw;
 let text=(message||saved).replace(/^Subject:.*$/gmi,'').split(/\n\s*(?:best regards|thanks\s*&\s*regards|kind regards|с уважением|[-_]{5,}|on .+wrote:|from:|发件人[:：])/i)[0];
 const chinese=text.match(/(?:中文|需求|要求)\s*[:：]\s*([^\n]+(?:\n(?!\s*\n)[^\n]+)*)/)?.[1];
 if(chinese&&/[\u3400-\u9fff]/u.test(chinese)){if(chinese.trim().length<=120)return {text:chinese.trim(),source:'原文中文内容'};text=chinese.trim()}
 if(/\b(?:do not|don't|not required|no need|without|except|unless)\b|不需要|无需|除外/i.test(text.replace(/do not hesitate|(?:please )?do not ask questions|无需提问/gi,'')))return {text:'原文包含否定或条件要求，需展开原文核对，暂不自动归纳。',source:'需人工核对'};
 const products=[];
 for(const [pattern,label] of [[/fire[ -]?(?:rated[ -]?)?(?:single[ -]leaf[ -]steel[ -]swing[ -])?doors?|防火门|耐火/i,'防火门'],[/acoustic|acústic|soundproof|隔声|隔音/i,'隔声门'],[/security|anti[ -]?burglary|安全门|防盗门/i,'安全门'],[/emergency hatch|检修口|应急舱口/i,'应急检修口'],[/smart locks?|智能锁/i,'智能锁']])if(pattern.test(text))products.push(label);
 if(!products.length&&/\bdoors?\b|puertas?|门类/i.test(text))products.push('门类产品');
 const quantities=[];for(const m of text.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(?:(?:steel|security|entrance|fire|rated|metal|acoustic|single|leaf)[ -]+){0,7}(doors?\b|units?\b|sets?\b|EA\b|樘|套|件)/gi)){if(/(?:EI|STC|RC)\s*[-]?\s*$/i.test(text.slice(Math.max(0,m.index-10),m.index)))continue;const n=m[1].replace(/,/g,'');const q=n+(/doors?|樘/i.test(m[2])?'樘':/sets?|套/i.test(m[2])?'套':'件');if(!quantities.includes(q))quantities.push(q)}
 const intents=[];for(const [pattern,label] of [[/catalog(?:ue)?|catalogo|catálogo|目录|画册/i,'产品目录'],[/quot(?:e|ation)|pricing|price|competitive offer|cotizaci[oó]n|precio|报价|价格/i,'报价'],[/data\s*sheet|technical specifications|ficha t[eé]cnica|技术资料|技术规格/i,'技术资料'],[/certificat|test reports?|认证|测试报告/i,'认证及测试资料'],[/drawings?|图纸/i,'图纸'],[/lead[ -]?time|tiempo de entrega|交期/i,'交期'],[/\bMOQ\b|minimum order|起订量/i,'起订量'],[/shipping|delivery|运输|物流/i,'运输安排'],[/payment|purchas(?:e|ing) terms|付款|支付/i,'付款及采购条款']])if(pattern.test(text))intents.push(label);
 const specs=[...new Set([...text.matchAll(/\b(?:STC\s*-?\s*\d+|EI\s*-?\s*\d+|RC\s*[12])(?=[^\d]|$)/gi)].map(m=>m[0].replace(/\s+/g,'')))];
 const sizes=[...new Set([...text.matchAll(/\b\d[\d,]*(?:\.\d+)?\s*(?:mm|cm|m)?\s*[×x]\s*\d[\d,]*(?:\.\d+)?\s*(?:mm|cm|m)\b/gi)].map(m=>m[0].replace(/\s+/g,'')))].slice(0,3);
 const parts=[];if(products.length)parts.push('产品：'+products.join('、'));if(quantities.length)parts.push((quantities.length>1?'分项数量：':'数量：')+quantities.join('、'));if(specs.length||sizes.length)parts.push('规格要求：'+[...specs,...sizes].join('、'));if(intents.length)parts.push('需提供：'+intents.join('、'));
 if(/wechat|whatsapp|微信/i.test(text)&&/contact|联系|contacnt/i.test(text))parts.push('希望通过微信或WhatsApp联系');
 if(!products.length)parts.unshift(/order|订货|采购/i.test(text)?'有订货意向，产品门类未明确':'产品门类未明确');
 if(!parts.slice(1).length&&!products.length)return {text:'需求暂未可靠识别，请展开原文核对。',source:'需人工核对'};
 if(!quantities.length)parts.push('数量未明确');
 return {text:parts.join('；')+'。',source:'本机中文整理，须结合原文核对'};
}
