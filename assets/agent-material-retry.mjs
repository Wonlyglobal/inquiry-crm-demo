// A failed read-only follow-up must not erase the last successful product scope.
// Explicit new topics, permission errors and deliberate cancellation never inherit it.
export function materialHistoryAfterFailure(question,error,previous=[]){
 if(!previous.length||[401,403].includes(Number(error?.status))||error?.name==='AbortError')return [];
 const q=String(question||'').trim().replace(/[？?。！!，,\s]/g,'');
 return /^(?:那|那么)?(?:它|这个|这款|该产品|该型号)?(?:的)?(?:保修多久|质保多久|保修期|质保期|怎么供电|如何供电|供电|电源|尺寸|材质|隔声|隔音|厚度|重量)(?:呢|是多少|多少|是什么)?$/.test(q)?previous:[];
}
