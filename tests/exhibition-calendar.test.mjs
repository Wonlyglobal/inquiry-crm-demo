import test from "node:test";
import assert from "node:assert/strict";
import {access} from "node:fs/promises";
import {EXHIBITION_EVENTS,eventState,filterExhibitions,formatEventRange,groupExhibitionsByMonth,registrationStatus} from "../assets/exhibition-calendar.mjs";

test("production calendar exposes only the public event schema",()=>{
  assert.equal(EXHIBITION_EVENTS.length,33);
  const allowed=["id","start","end","name","city","country","region","category","url","verified","frequency","statsYear","exhibitors","visitors","metricsNote","logo","registrationOpen","registrationDeadline","registrationNote"];
  for(const event of EXHIBITION_EVENTS){
    assert.deepEqual(Object.keys(event).sort(),allowed.sort());
    assert.match(event.url,/^https:\/\//);
    assert.ok(event.start<=event.end);
    assert.ok(event.frequency&&event.statsYear&&event.metricsNote);
    assert.match(event.logo,/^\.\/assets\/exhibition-logos\/[a-z0-9.-]+$/);
    assert.ok(event.registrationOpen===null||typeof event.registrationOpen==="boolean");
    assert.ok(event.registrationDeadline===null||/^\d{4}-\d{2}-\d{2}$/.test(event.registrationDeadline));
    assert.ok(event.registrationNote);
    assert.ok(event.exhibitors===null||typeof event.exhibitors==="number"||typeof event.exhibitors==="string");
    assert.ok(event.visitors===null||typeof event.visitors==="number"||typeof event.visitors==="string");
  }
});

test("global lock and access-control exhibitions are included from official sources",()=>{
  for(const name of ["Security Essen 2026","Intersec Global 2027","ISC West 2027","The Security Event Europe 2027","ALOA Convention & Security Expo 2027"]){
    const event=EXHIBITION_EVENTS.find(item=>item.name===name);assert.ok(event,name);assert.equal(event.verified,true);assert.match(event.category,/门锁|门禁|锁匠/);
  }
});

test("registration countdown never invents an unpublished deadline",()=>{
  const today=new Date("2026-10-13T12:00:00+08:00"),intersec=EXHIBITION_EVENTS.find(event=>event.name==="Intersec Global 2027");
  assert.deepEqual(registrationStatus(intersec,today),{kind:"open",text:"观众注册已开放；官网未公布截止日"});
  assert.deepEqual(registrationStatus({start:"2026-12-10",end:"2026-12-12",registrationDeadline:"2026-11-12"},today),{kind:"urgent",text:"距报名截止 30 天 · 2026-11-12"});
});

test("every exhibition logo is bundled with the production site",async()=>{
  await Promise.all(EXHIBITION_EVENTS.map(event=>access(new URL(`../${event.logo.slice(2)}`,import.meta.url))));
});

test("official date corrections are represented",()=>{
  const japan=EXHIBITION_EVENTS.find(event=>event.name==="JAPAN BUILD Tokyo");
  assert.equal(japan.start,"2026-12-02");
  assert.equal(japan.end,"2026-12-04");
  const saudi=EXHIBITION_EVENTS.filter(event=>event.name.startsWith("Big 5 Construct Saudi"));
  assert.deepEqual(saudi.map(event=>event.start),["2027-05-24","2027-09-19"]);
  assert.ok(saudi.every(event=>event.verified));
});

test("filters and month grouping remain deterministic",()=>{
  const today=new Date("2026-10-13T12:00:00+08:00");
  assert.equal(eventState(EXHIBITION_EVENTS[0],today),"past");
  const asian2027=filterExhibitions(EXHIBITION_EVENTS,{year:"2027",region:"亚洲",status:"upcoming"},today);
  assert.ok(asian2027.length>0);
  assert.ok(asian2027.every(event=>event.start.startsWith("2027-")&&event.region==="亚洲"));
  assert.deepEqual(Object.keys(groupExhibitionsByMonth(asian2027)),[...new Set(asian2027.map(event=>event.start.slice(0,7)))]);
  assert.equal(filterExhibitions(EXHIBITION_EVENTS,{keyword:"东京",status:"all"},today)[0].name,"JAPAN BUILD Tokyo");
});

test("cards show the complete date range, including cross-month events",()=>{
  assert.equal(formatEventRange({start:"2026-11-23",end:"2026-11-26"}),"2026.11.23—26");
  assert.equal(formatEventRange({start:"2027-03-30",end:"2027-04-02"}),"2027.03.30—04.02");
});
