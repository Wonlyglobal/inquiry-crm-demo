import test from 'node:test';import assert from 'node:assert/strict';
import {youtubeAnalytics} from '../integrations/social-summary/supabase/functions/social-summary/youtube.mjs';
const now=new Date('2026-09-23T00:00:00Z');
const response=x=>({ok:true,text:async()=>JSON.stringify(x)});
test('YouTube requires credentials without calling network',async()=>{assert.equal((await youtubeAnalytics(()=>'',()=>{throw Error()},now)).status,'not_configured')});
test('YouTube rejects different channel before analytics request',async()=>{let calls=0;const r=await youtubeAnalytics(()=>'secret',async()=>response(++calls===1?{access_token:'token'}:{items:[{id:'other'}]}),now);assert.equal(r.status,'channel_mismatch');assert.equal(calls,2);assert.ok(!JSON.stringify(r).includes('secret'))});
test('YouTube preserves zero and rejects missing values without exposing errors',async()=>{for(const value of [0,null]){let calls=0;const r=await youtubeAnalytics(()=>'secret',async()=>response([ {access_token:'token'},{items:[{id:'UCoUw2uc9lSK2qj4xXPrAvFw'}]},{columnHeaders:['day','views','estimatedMinutesWatched'].map(name=>({name})),rows:[['2026-09-19',value,2]]}][calls++]),now);assert.equal(r.status,value===0?'available':'unavailable');if(value===0){assert.equal(r.totals.views,0);assert.equal(r.data_through,'2026-09-19')}assert.ok(!JSON.stringify(r).includes('secret'))}});
