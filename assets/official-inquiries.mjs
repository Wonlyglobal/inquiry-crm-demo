// The server distinguishes creation provenance from the editable source label.
// A CSV row labelled "website" is still a personally recorded opportunity.
export async function officialInquiryRows(rows,rpc){
  const input=rows||[],origins=new Map();
  const ids=[...new Set(input.map(row=>row.id).filter(Boolean))];
  for(let start=0;start<ids.length;start+=200){
    const {data,error}=await rpc('get_inquiry_channel_origins',{target_ids:ids.slice(start,start+200)});
    if(error)throw new Error('官方渠道口径核对失败：'+(error.message||'请重试'));
    if(!Array.isArray(data))throw new Error('官方渠道口径返回异常，请刷新重试');
    data.forEach(item=>{if(ids.includes(item.id))origins.set(item.id,item.origin)});
  }
  return input.filter(row=>origins.get(row.id)==='official');
}
