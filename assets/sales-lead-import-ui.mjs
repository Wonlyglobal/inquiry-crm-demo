// Presentation only: never stores file contents, enables import, or calls CRM.
export function renderLeadFileState(nodes,{state='empty',file=null,rowCount=0,error=''}={}){
 nodes.name.textContent=file?.name||'尚未选择文件';
 nodes.name.title=file?.name||'';
 const messages={empty:'支持 XLSX、XLS、CSV · 最多 200 行 / 2MB',loading:'正在读取并校验文件…',ready:`已读取 ${rowCount} 条线索，请核对下方预览。`,error:`文件未通过校验：${error||'请检查后重新选择'}`,done:'导入已保存，可继续选择新的文件。'};
 nodes.state.textContent=messages[state]||messages.empty;
 nodes.state.dataset.state=Object.hasOwn(messages,state)?state:'empty';
}
export function bindLeadFilePicker(button,input){
 button.onclick=()=>{if(!button.disabled&&!input.disabled)input.click()};
}
