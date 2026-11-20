import assert from 'node:assert/strict';
import test from 'node:test';
import {answerVerifiedVideo,loadVerifiedVideoIndex} from '../supabase/functions/agent-conversation/verified-video.mjs';

const entry = {
  id: '00000000-0000-0000-0000-000000000001',
  name: '测试品牌宣传片.mp4',
  updatedAt: '2026-01-01T00:00:00.000Z',
  visibility: 'internal',
  sourceSha256: 'f'.repeat(64),
  reviewedFrames: 96,
  startMs: 6367,
  endMs: 8333,
  quote: '测试品牌',
  keywords: ['测试品牌'],
};
const source = {
  ...entry,
  type: '视频',
  isCurrentVersion: true,
  video: {status: 'ready',segments: [{text: '{"code":"raw"}'}]},
};
const question = '测试品牌视频的时间码';
const lookup = asset => async () => ({status: 'available',assets: [asset]});

test('verified screen text renders only its authorized file and exact bounds', async () => {
  const result = await answerVerifiedVideo(question,async () => [entry],async name => {
    assert.equal(name,entry.name);
    return lookup(source)();
  });
  assert.deepEqual(result,{answer:'《测试品牌宣传片.mp4》 0:06.367–0:08.333，画面显示「测试品牌」。',count:1});
});

test('a missing or changed current source cannot release a curated citation', async () => {
  for (const asset of [
    {...source,id:'another'}, {...source,isCurrentVersion:false}, {...source,visibility:'public'},
    {...source,updatedAt:'2026-01-02T00:00:00Z'}, {...source,video:{status:'queued'}},
  ]) {
    const result = await answerVerifiedVideo(question,async () => [entry],lookup(asset));
    assert.equal(result.count,0);
    assert.doesNotMatch(result.answer,/测试品牌|6\.367/);
  }
});

test('delivery and unrelated queries do not enter the curated answer', async () => {
  const read = async () => [entry];
  const never = () => assert.fail('unexpected material access');
  for (const q of ['帮我下载测试品牌宣传片', '另一个视频的时间码', '测试品牌产品尺寸']) {
    assert.equal(await answerVerifiedVideo(q,read,never),null);
  }
});

test('only the three distinct, valid server-private entries can be loaded', async () => {
  const assets = [entry, {...entry,id:entry.id.slice(0,-1)+'2'}, {...entry,id:entry.id.slice(0,-1)+'3'}];
  const load = candidate => loadVerifiedVideoIndex({storage:{from(bucket){
    assert.equal(bucket,'agent-private-knowledge');
    return {download:async () => ({data:new Blob([JSON.stringify({schema:'grace-verified-video-v1',assets:candidate})])})};
  }}});
  assert.deepEqual(await load(assets), assets);
  assert.deepEqual(await load([entry,entry,entry]), []);
  assert.deepEqual(await load([entry,assets[1],{...assets[2],quote:'{"code":"raw"}'}]), []);
});
