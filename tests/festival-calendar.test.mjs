import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("exhibition calendar includes the festival banner and month grid", () => {
  assert.match(source, /id="festival-calendar"/);
  assert.match(source, /function renderFestivalCalendar\(activityRows=\[\]\)/);
  assert.match(source, /近期节日一览/);
  assert.match(source, /仅展示节日日期与适用地区/);
  assert.match(source, /renderFestivalCalendar\(\[\]\)/);
});

test("festival dates include fixed, rule-based and dated events", () => {
  assert.match(source, /万圣节/);
  assert.match(source, /黑色星期五/);
  assert.match(source, /festivalEaster/);
  assert.match(source, /2027-02-06/);
});

test("mobile layout shows only the nearest upcoming festival", () => {
  assert.match(source, /\.festival-card:not\(:first-child\) \{ display:none; \}/);
  assert.match(source, /\.festival-weekdays,\.festival-grid \{ min-width:700px; \}/);
});

test('actual festival logic handles date boundaries and only displays holidays',()=>{
 const begin=source.indexOf('      const FESTIVAL_FIXED=');
 const end=source.indexOf('      let whatsappRealtimeChannel',begin);
 const nodes=Object.fromEntries(['#festival-calendar','#festival-banner','#festival-month'].map(key=>[key,{innerHTML:'',classList:{remove(){}}}]));
 const clock=new Date(2026,9,29,12);
 class FixedDate extends Date{constructor(...args){super(...(args.length?args:[clock.getTime()]))}}
 const logic=new Function('Date','$','esc','icons',source.slice(begin,end)+';return {festivalsOfYear,upcomingFestivals,renderFestivalCalendar,changeFestivalMonth,festivalAudience};')(FixedDate,key=>nodes[key],v=>String(v),()=>{});
 const blackFriday=logic.festivalsOfYear(2026).find(x=>x.en==='Black Friday');
 const industry=logic.festivalsOfYear(2026).filter(x=>x.relevance);
 assert.equal(industry.length,5);assert.ok(industry.every(x=>x.source.startsWith('https://')));
 const architecture=industry.find(x=>x.en==='World Architecture Day');assert.equal(architecture.date.getMonth(),9);assert.equal(architecture.date.getDate(),5);
 assert.equal(logic.festivalAudience(architecture).importance,'行业重点关注');
 assert.match(logic.festivalAudience(architecture).scope,/非法定/);

 assert.equal(logic.festivalAudience(blackFriday).importance,'重点关注');
 assert.match(logic.festivalAudience(blackFriday).scope,/商业活动/);
 const earth=logic.festivalsOfYear(2026).find(x=>x.en==='Earth Day');
 assert.match(logic.festivalAudience(earth).scope,/不代表各国统一休假/);
 assert.match(logic.festivalAudience({region:'印度·海外印裔',en:'Diwali',type:'holiday'}).countries,/印度/);

 assert.equal(blackFriday.date.getMonth(),10);assert.equal(blackFriday.date.getDate(),27);
 assert.equal(logic.upcomingFestivals(new Date(2027,0,1),1)[0].date.getFullYear(),2027);
 logic.renderFestivalCalendar([{day:'2026-10-29',total_sent:2,total_received:3},{day:'2026-10-29',total_sent:4,total_received:1}]);
 assert.doesNotMatch(nodes['#festival-month'].innerHTML,/收 4 · 发 6|邮件活动/);
 assert.doesNotMatch(nodes['#festival-banner'].innerHTML,/客户触达|预热|提前 3 周/);
 assert.equal((nodes['#festival-month'].innerHTML.match(/class="festival-day /g)||[]).length,42);
 assert.equal((nodes['#festival-banner'].innerHTML.match(/class="festival-card"/g)||[]).length,3);
 logic.changeFestivalMonth(2);assert.match(nodes['#festival-month'].innerHTML,/2026年12月/);
 logic.changeFestivalMonth(1);assert.match(nodes['#festival-month'].innerHTML,/2027年1月/);assert.match(nodes['#festival-month'].innerHTML,/元旦/);
 logic.changeFestivalMonth(-1);assert.match(nodes['#festival-month'].innerHTML,/2026年12月/);

});


test('international calendar tabs switch panels without changing exhibition data',()=>{
 const start=source.indexOf('      let internationalCalendarTab=');
 const end=source.indexOf('      function festivalsOfYear(',start);
 const panels=Object.fromEntries(['#international-exhibitions','#festival-calendar','#exhibition-calendar-page .exhibition-note'].map(id=>[id,{hidden:false,classList:{toggle(name,value){panels[id].hidden=value}}}]));
 const buttons=['exhibitions','holidays'].map(tab=>({dataset:{internationalTab:tab},classList:{toggle(){}},setAttribute(name,value){this[name]=value}}));
 let renders=0;
 const select=new Function('$','$$','renderFestivalCalendar',source.slice(start,end)+';return setInternationalCalendarTab;')(id=>panels[id],()=>buttons,()=>renders++);
 select('holidays');assert.equal(panels['#international-exhibitions'].hidden,true);assert.equal(panels['#festival-calendar'].hidden,false);assert.equal(buttons[1]['aria-selected'],'true');assert.equal(renders,1);
 select('exhibitions');assert.equal(panels['#international-exhibitions'].hidden,false);assert.equal(panels['#festival-calendar'].hidden,true);assert.equal(buttons[0]['aria-selected'],'true');assert.equal(renders,1);
});
