import test from 'node:test';import assert from 'node:assert/strict';
import {windowSummary} from '../integrations/social-summary/supabase/functions/social-summary/live-platforms.mjs';
test('production 28-day window preserves partial status and excludes missing counters from totals',()=>{
 const x=windowSummary([{published_at:'2026-10-20',metrics:{views:0}},{published_at:'2026-10-19',metrics:{views:null}},{published_at:'2026-08-01',metrics:{views:20}}],['views'],{start:new Date('2026-10-01'),end:new Date('2026-10-22'),pagesRead:1,complete:false,stopReason:'page_cap',rankBy:['views']});
 assert.equal(x.posts_in_window,2);assert.equal(x.totals.views.sum,0);assert.equal(x.totals.views.known_posts,1);assert.equal(x.complete,false);assert.equal(x.stop_reason,'page_cap');assert.equal(x.top_posts.length,1);
});
