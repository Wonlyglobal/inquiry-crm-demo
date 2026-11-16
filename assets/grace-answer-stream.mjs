// Final result is authoritative; a closed connection without it is never success.
export async function readAnswerStream(response,onDelta){
 if(!response.headers.get('content-type')?.includes('text/event-stream'))return response.json();
 const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',result=null,size=0;
 try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>2*1024*1024)throw Error('回答过长，请重试');buffer+=decoder.decode(value,{stream:true});let end;
 while((end=buffer.search(/\r?\n\r?\n/))>=0){const block=buffer.slice(0,end);buffer=buffer.slice(end+(buffer[end]==='\r'?4:2));const event=block.split(/\r?\n/).find(x=>x.startsWith('event:'))?.slice(6).trim();const raw=block.split(/\r?\n/).filter(x=>x.startsWith('data:')).map(x=>x.slice(5).trim()).join('\n');if(!raw)continue;const data=JSON.parse(raw);
 if(event==='error')throw Error(data.error||'回答中断，请重试');if(event==='delta'&&typeof data.text==='string')onDelta?.(data.text);if(event==='result')result=data;
 }}if(!result)throw Error('回答连接中断，请重试');return result;
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
}
