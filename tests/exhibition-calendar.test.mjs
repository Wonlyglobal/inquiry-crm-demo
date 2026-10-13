import test from "node:test";
import assert from "node:assert/strict";
import {EXHIBITION_EVENTS,eventState,filterExhibitions,groupExhibitionsByMonth} from "../assets/exhibition-calendar.mjs";

test("production calendar exposes only the public event schema",()=>{
  assert.equal(EXHIBITION_EVENTS.length,28);
  const allowed=["id","start","end","name","city","country","region","category","url","verified"];
  for(const event of EXHIBITION_EVENTS){
    assert.deepEqual(Object.keys(event).sort(),allowed.sort());
    assert.match(event.url,/^https:\/\//);
    assert.ok(event.start<=event.end);
  }
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
