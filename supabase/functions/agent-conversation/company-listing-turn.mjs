const OWN=/王力|WONLY|WANGLI|我司|本公司|我们公司/iu;
const FOREIGN=/竞品|客户|对手|别的公司|其他公司|另一家|比较|对比/iu;
const FIELD=/(股票代码|证券代码|上市代码|股票编号|上市(?:时间|日期|年份|在哪|的年份)|(?:什么时候|何时|哪年|哪一年)上市|交易所|哪家交易所)/u;

export function companyListingTurn(question,history=[]){
 const q=String(question||'').normalize('NFKC').trim();
 if(q.length>120||!FIELD.test(q)||FOREIGN.test(q)||/翻译|写|介绍|和.*分别|公司.*(?:成立|愿景|使命).*(?:股票|上市)|(?:股票|上市).*?(?:成立|愿景|使命)/u.test(q))return null;
 const previous=String(history.at(-1)||'').replace(/^(?:画册检索|事实核对|公司资料)：/u,'');
 if(!OWN.test(q)){
  if(!/^(?:那|它|这家公司|股票代码|证券代码|上市时间|上市年份|交易所)/u.test(q)||!OWN.test(previous)||FOREIGN.test(previous)||
   !/上市|股票代码|(?:什么时候|何时|哪年|哪一年)成立|成立(?:时间|日期|年份)/u.test(previous))return null;
 }
 const field=/代码|编号/u.test(q)?'code':/交易所|上市在哪/u.test(q)?'exchange':'date';
 return {field,context:`公司资料：王力${field==='code'?'股票代码':field==='exchange'?'上市交易所':'上市时间'}`};
}

export function companyListingAnswer(turn,catalog){
 const row=(catalog?.facts||[]).find(r=>r.topic==='listing'&&r.catalog==='c2'&&Number.isInteger(r.page)&&r.page>0);
 const text=String(row?.zh||'');
 const value=turn.field==='code'?text.match(/股票代码\s*[：:]?\s*(\d{6})/u)?.[1]
  :turn.field==='exchange'?text.match(/(?:在|于)([^，。；]{2,30}交易所[^，。；]{0,12}?)上市/u)?.[1]
  :text.match(/(\d{4}年\d{1,2}月\d{1,2}日)/u)?.[1];
 if(!value)return '本次暂未取得可引用的王力上市资料。';
 const answer=turn.field==='code'?`王力安防的股票代码是 ${value}。`:turn.field==='exchange'?`画册记载，王力安防在${value}上市。`:`画册记载，王力安防于 ${value} 上市。`;
 return `${answer}\n出处：零售画册 PDF第${row.page}页。`;
}
