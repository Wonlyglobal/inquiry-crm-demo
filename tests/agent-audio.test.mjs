import test from 'node:test';
import assert from 'node:assert/strict';
import {playWithDeadline} from '../assets/agent-audio.mjs';
const audio=()=>({play:()=>new Promise(()=>{}),pause(){this.paused=true}});
test('hung playback startup times out and releases handlers',async()=>{const a=audio();await assert.rejects(playWithDeadline(a,null,{startMs:5}),/启动超时/);assert.equal(a.paused,true);assert.equal(a.onended,null)});
test('stop interrupts pending playback immediately',async()=>{const a=audio(),c=new AbortController();const p=playWithDeadline(a,c.signal);c.abort();await assert.rejects(p,/已停止/);assert.equal(a.paused,true)});
test('playing does not wait forever for a missing ended event',async()=>{const a=audio();let count=0;const p=playWithDeadline(a,null,{endMs:5,onPlaying:()=>count++});a.onplaying();a.onplaying();await assert.rejects(p,/播放超时/);assert.equal(count,1)});
test('normal playback ends cleanly and blocked autoplay reports failure',async()=>{const a=audio(),p=playWithDeadline(a);a.onplaying();a.onended();await p;const b=audio();b.play=()=>Promise.reject(Error('NotAllowed'));await assert.rejects(playWithDeadline(b),/未允许自动播放/)});
