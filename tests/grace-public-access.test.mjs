import test from 'node:test';
import assert from 'node:assert/strict';
import {graceAccess,publicActionAllowed} from '../assets/grace-access.mjs';
test('public registration never grants enterprise access',()=>{
 assert.deepEqual(graceAccess({authenticated:true,publicAccountActive:true,user_metadata:{role:'owner'}}),{mode:'public',chat:true,enterprise:false});
});
test('inactive and unauthenticated accounts fail closed',()=>{
 assert.equal(graceAccess({enterpriseAuthorized:true}).chat,false);
 assert.equal(graceAccess({authenticated:true}).chat,false);
 assert.equal(graceAccess({authenticated:true,enterpriseAuthorized:'true'}).enterprise,false);
});
test('public actions cannot request enterprise records or signing',()=>{
 for(const action of ['material-file','material-progress','seo-dashboard','voiceprint','competitor-watch','timeline','account-delete',null])assert.equal(publicActionAllowed(action),false);
 assert.equal(publicActionAllowed('chat'),true);
});

test('browser config contains only an independent public anon identity',async()=>{
 const {publicConfig}=await import('../assets/grace-public-config.mjs');
 const claims=JSON.parse(Buffer.from(publicConfig.anonKey.split('.')[1],'base64url').toString());
 assert.equal(claims.role,'anon');assert.equal(claims.ref,publicConfig.projectRef);
 assert.ok(!['plhverjihjilnuhlhlxi','rpiviiyvbpwslywqcd'].includes(claims.ref));
 assert.deepEqual(Object.keys(publicConfig).sort(),['anonKey','projectRef']);
});
