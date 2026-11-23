import test from 'node:test';
import assert from 'node:assert/strict';
import {foldQuestionSources} from '../assets/agent-question-windows.mjs';
class Element {
 constructor(tag){this.tag=tag;this.style={};this.children=[];}
 append(...elements){this.children.push(...elements)}
 replaceChildren(...elements){this.children=elements}
}
test('answer citations collapse without turning metadata into visible content',()=>{
 globalThis.document={createElement:tag=>new Element(tag)};
 const node=new Element('div');
 node.textContent='直接回答。\n来源：来源：公司文件/样例.xlsx；SHA256 a123。 整理说明\n出处：第 2 页\n资料生成日期：测试\n知识编号：internal\n\n必要条件仍显示。';
 foldQuestionSources(node);
 const [body,details]=node.children;
 assert.equal(body,'直接回答。\n\n必要条件仍显示。');
 assert.equal(details.tag,'details');
 assert.ok(!details.open);
 assert.equal(details.children[0].textContent,'查看出处');
 assert.equal(details.children[1].textContent,'样例.xlsx\n第 2 页');
});
