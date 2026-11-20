// Signed draft context only. No browser persistence or external-model history.
export function createWritingRecovery({load,apply}){
 let generation=0,done=false,pending=null;
 return {
  reset(){generation++;done=false;pending=null},
  skip(){generation++;done=true;pending=null},
  async restore(isCurrent=()=>true){
   if(done)return;if(pending)return pending;
   const epoch=generation;
   const task=(async()=>{const data=await load();if(epoch!==generation||!isCurrent())return;done=true;if(data?.draft?.answer&&data.draft.context?.material_question)apply(data.draft)})();
   pending=task;try{await task}finally{if(pending===task)pending=null}
  }
 };
}
