import test from 'node:test';import assert from 'node:assert/strict';
import {materialQuery} from '../supabase/functions/agent-conversation/document-knowledge.mjs';
import {filterMaterialResults} from '../supabase/functions/agent-conversation/material-relevance.mjs';
const q='防火门英文产品手册';
test('fire door English manual requires all three conditions',()=>{const assets=[{name:'防火门产品手册.pdf',language:'英文'},{name:'医用门安装方式.pdf',language:'英文'},{name:'防火门产品手册.pdf',language:'中文'},{name:'防火门技术参数.pdf',language:'英文'},{name:'Fire rated doors brochure English.pdf'}];assert.deepEqual(filterMaterialResults({status:'available',assets},q).assets,[assets[0],assets[4]])});
test('unknown language is not silently assumed English',()=>{assert.equal(filterMaterialResults({status:'available',assets:[{name:'防火门产品手册.pdf',language:''}]},q).assets.length,0)});
test('latest product request retains product topic',()=>{assert.notEqual(materialQuery('最新防火门英文产品手册').query,'');assert.equal(materialQuery('查看最新物料').query,'')});
