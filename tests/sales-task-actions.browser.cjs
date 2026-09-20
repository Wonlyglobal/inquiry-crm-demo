const {chromium}=require(process.env.CRM_PLAYWRIGHT_MODULE||'playwright');
const fs=require('fs'),assert=require('assert/strict');
(async()=>{
const html=fs.readFileSync(require('path').join(__dirname,'../index.html'),'utf8');
const source=html.slice(html.indexOf('      function salesTaskAdvice('),html.indexOf('      async function completeFollowUpFromCalendar('));
const browser=await chromium.launch({headless:true,executablePath:process.env.CRM_CHROME_EXECUTABLE});const page=await browser.newPage({viewport:{width:1100,height:1000}});
await page.route('**/*',r=>r.abort());
await page.setContent(`<style>${html.match(/<style>([\s\S]*?)<\/style>/)[1]} body{padding:20px}#dashboard-modal{display:block;position:static;max-width:820px;margin:auto;padding:20px;background:white}</style><div id="dashboard-modal"></div>`);
await page.addScriptTag({content:`
const $=s=>document.querySelector(s),profile={role:'sales',id:'seller'},moduleMemoryCache=new Map();let activeModuleView='sales-today';window.calls=[];window.fail=false;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate=x=>x,displayCountry=x=>x,localDateTimeInputValue=x=>x.slice(0,16),toast=x=>window.notice=x;
const loadModule=async()=>{},loadInquiries=async()=>{},appConfirm=async()=>true;
const openDashboardModal=(title,body)=>{$('#dashboard-modal').innerHTML='<h2>'+esc(title)+'</h2>'+body};
const supabase={from(table){const q={select(){return q},eq(){return q},order(){return q},limit(){return q},single:async()=>({data:table==='inquiries'?{id:'demo',inquiry_no:1,title:'合成客户 · 项目采购需求',owner_id:'seller',status:'contacted',validity:'valid',target_country:'巴西 / Brazil',contact_name:'测试联系人',companies:{name:'合成公司'},demand_summary:'采购 100 套门，需要核对规格与认证。'}:{id:'original'}}),maybeSingle:async()=>({data:{content:'已核对数量，等待客户提供规格。',created_at:'2026-09-20'}})};return q},rpc:async(name,payload)=>{window.calls.push({name,payload});await new Promise(r=>setTimeout(r,80));return {error:window.fail?{message:'模拟保存失败'}:null}}};
${source}
window.openTask=()=>openSalesTask({id:'demo',category:'followup',reason:'今日计划跟进：确认规格与认证要求',followupId:'original'});
`});
await page.evaluate(()=>openTask());
await page.locator('#task-follow-content').fill('已电话确认客户将在周五提供规格');await page.locator('#task-follow-next').fill('2099-09-21T10:00');
await page.screenshot({path:require('path').join(process.env.CRM_QA_OUTPUT||require('os').tmpdir(),'crm-task-desktop.png'),fullPage:true});
await page.evaluate(()=>window.fail=true);await page.locator('#task-follow-form button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('#task-follow-status').textContent.includes('模拟保存失败'));
assert.equal(await page.locator('#task-follow-content').inputValue(),'已电话确认客户将在周五提供规格');
await page.evaluate(()=>window.fail=false);await page.locator('#task-follow-form button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('#task-follow-form button[type=submit]').textContent==='已保存');
await page.evaluate(()=>document.querySelector('#task-follow-form').dispatchEvent(new Event('submit',{cancelable:true})));
assert.equal(await page.evaluate(()=>calls.length),2);
await page.locator('#task-complete-original').click();await page.waitForFunction(()=>document.querySelector('#task-complete-original').textContent==='原跟进已完成');
assert.equal(await page.evaluate(()=>calls[2].payload.target_follow_up_id),'original');
await page.setViewportSize({width:390,height:844});await page.evaluate(()=>openTask());await page.screenshot({path:require('path').join(process.env.CRM_QA_OUTPUT||require('os').tmpdir(),'crm-task-mobile.png'),fullPage:true});
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
console.log('Browser checks passed: save failure preserves input; explicit retry; duplicate submit blocked; exact original-task completion; mobile no overflow.');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
