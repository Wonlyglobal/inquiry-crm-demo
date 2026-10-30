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
