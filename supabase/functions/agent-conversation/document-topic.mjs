// Retrieval aliases select source pages; they never manufacture product facts.
const topics=[
 [/保养|维护|清洁|清洗|打理|通风|干燥|防潮|maintenance|cleaning/i,['保养','维护','清洁','日常使用','通风','干燥']],
 [/验收|检验|缝隙|间隙|留缝|验货/i,['检验标准','缝隙','空隙','留缝']],
 [/安装|装配/i,['安装','门套线','交接']],
 [/厚度|多厚|几毫米厚|thickness/i,['厚度','mm厚']],
 [/填充|填料|门芯|内部结构/i,['填充','格栅','实心','珍珠岩']],
 [/系列|种类|分类/i,['系列','产品分类']],
];
export function documentTopicTerms(question){
 return [...new Set(topics.filter(([pattern])=>pattern.test(question)).flatMap(([,terms])=>terms))];
}
export function documentTopicMatch(chunks,question){
 const terms=documentTopicTerms(question);let best={score:0,quote:''};
 for(const chunk of chunks){
  const hits=terms.filter(term=>chunk.includes(term));
  if(hits.length>best.score){
   const at=Math.min(...hits.map(term=>chunk.indexOf(term))),start=Math.max(0,at-100);
   best={score:hits.length,quote:chunk.slice(start,start+500)};
  }
 }
 return best;
}

export function woodTrainingQuestion(question){
 return /木门/.test(question)&&documentTopicTerms(question).length>0;
}

// The current library returns only the first six matching pages per file.
// Search a distinctive phrase instead of matching every page headed 木门.
export function woodTrainingSearchTerm(question){
 if(/验收|检验|缝隙|间隙|留缝|验货/.test(question))return '空隙';
 if(/通风|干燥|防潮/.test(question))return '通风干燥';
 if(/保养|维护|清洁|清洗|打理|maintenance|cleaning/i.test(question))return '维护和保养';
 if(/厚度|多厚|几毫米厚|thickness/i.test(question))return '门扇厚度';
 if(/填充|填料|门芯|内部结构/.test(question))return '填充';
 if(/安装|装配/.test(question))return '安装';
 return '产品分类';
}
