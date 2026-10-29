import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {renderLeadFileState,bindLeadFilePicker} from '../assets/sales-lead-import-ui.mjs';
const nodes=()=>({name:{textContent:'',title:''},state:{textContent:'',dataset:{}}});
test('file feedback distinguishes empty/loading/ready/error/saved without changing import permission',()=>{
 const n=nodes(),file={name:'合成客户线索.xlsx',size:2048};renderLeadFileState(n);assert.match(n.name.textContent,/尚未选择/);
 renderLeadFileState(n,{state:'loading',file});assert.equal(n.name.textContent,file.name);assert.equal(n.state.dataset.state,'loading');assert.match(n.state.textContent,/正在读取/);
 renderLeadFileState(n,{state:'ready',file,rowCount:3});assert.match(n.state.textContent,/3 条/);
 renderLeadFileState(n,{state:'error',file,error:'文件不得超过2MB'});assert.match(n.state.textContent,/2MB/);assert.equal(n.state.dataset.state,'error');
 renderLeadFileState(n,{state:'done'});assert.equal(n.name.title,'');assert.match(n.state.textContent,/导入已保存/);
});
test('long and HTML-looking filenames stay inert text and retain full title',()=>{
 const n=nodes(),name='<img src=x onerror=alert(1)>'+ '超长文件名'.repeat(60)+'.xlsx';renderLeadFileState(n,{state:'loading',file:{name}});assert.equal(n.name.textContent,name);assert.equal(n.name.title,name);assert.equal(n.name.innerHTML,undefined);
});
test('picker opens native file dialog only from enabled button and input',()=>{
 let clicks=0;const button={disabled:false},input={disabled:false,click(){clicks++}};bindLeadFilePicker(button,input);button.onclick();assert.equal(clicks,1);button.disabled=true;button.onclick();assert.equal(clicks,1);button.disabled=false;input.disabled=true;button.onclick();assert.equal(clicks,1);
});
test('entry groups primary actions and import separately with keyboard-accessible file chooser',()=>{
 const html=readFileSync(new URL('../sales-leads.html',import.meta.url),'utf8');
 assert.match(html,/class="entry-actions wide"/);assert.match(html,/class="import-panel"/);assert.match(html,/id="select-file"[^>]+type="button"[^>]+aria-controls="excel"/);
 assert.match(html,/id="excel"[^>]+hidden/);assert.match(html,/id="no-new"[^>]+type="button"/);assert.match(html,/id="import"[^>]+type="button"[^>]+disabled/);
 const page=readFileSync(new URL('../assets/sales-leads-page.mjs',import.meta.url),'utf8');assert.match(page,/#from,#to,#sales,#excel/);assert.match(page,/finally\{\$\('#excel'\)\.value=''/);assert.match(page,/导入已保存，但列表刷新失败/);
});
test('remove selected file clears pending rows and preview without a CRM request',async()=>{
 const {clearLeadImportSelection}=await import('../assets/sales-lead-import-ui.mjs');
 let pending=[{company:'Synthetic'}];
 const n={...nodes(),remove:{hidden:false}};
 const controls={input:{value:'file.xlsx'},preview:{textContent:'待导入1条',hidden:false},confirm:{disabled:false},nodes:n};
 clearLeadImportSelection(controls,()=>{pending=[]});
 assert.equal(pending.length,0);assert.equal(controls.input.value,'');assert.equal(controls.preview.textContent,'');
 assert.equal(controls.preview.hidden,true);assert.equal(controls.confirm.disabled,true);assert.equal(n.remove.hidden,true);
 assert.match(n.name.textContent,/尚未选择/);
 for(const state of ['ready','error']){renderLeadFileState(n,{state,file:{name:'new.xlsx'}});assert.equal(n.remove.hidden,false)}
 renderLeadFileState(n,{state:'done'});assert.equal(n.remove.hidden,true);
});
test('remove action is guarded while file processing is busy and cannot delete stored records',()=>{
 const page=readFileSync(new URL('../assets/sales-leads-page.mjs',import.meta.url),'utf8');
 const handler=page.slice(page.indexOf("$('#remove-import-file').onclick="),page.indexOf('bindLeadFilePicker('));
 assert.match(handler,/if\(busy\)return/);assert.match(handler,/pendingRows=\[\]/);assert.doesNotMatch(handler,/rpc\(|fetch\(|\.delete\(/);
 const html=readFileSync(new URL('../sales-leads.html',import.meta.url),'utf8');
 assert.match(html,/id="remove-import-file"[^>]+type="button"[^>]+hidden/);
});
