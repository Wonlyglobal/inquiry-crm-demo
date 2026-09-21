import test from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';
import {simpleParser} from 'mailparser';
// Stream transport serializes locally. No SMTP, database or credentials.
test('locked mail stack preserves Unicode, reply threading and attachment bytes',async()=>{
 const transport=nodemailer.createTransport({streamTransport:true,buffer:true,newline:'windows'});
 const replyId='<synthetic-original@example.invalid>';
 const sent=await transport.sendMail({from:'"合成销售" <sender@example.invalid>',to:'"Synthetic Buyer" <buyer@example.invalid>',cc:['copy@example.invalid'],subject:'合成报价 / Synthetic quote',text:'合成正文\nReply content',html:'<p>合成正文</p>',inReplyTo:replyId,references:[replyId],attachments:[{filename:'synthetic.txt',content:Buffer.from('synthetic attachment')}]});
 const parsed=await simpleParser(sent.message);
 assert.equal(parsed.subject,'合成报价 / Synthetic quote');
 assert.equal(parsed.to.value[0].address,'buyer@example.invalid');
 assert.equal(parsed.cc.value[0].address,'copy@example.invalid');
 assert.equal(parsed.from.value[0].name,'合成销售');
 assert.equal(parsed.inReplyTo,replyId);
 assert.ok([parsed.references].flat().includes(replyId));
 assert.match(parsed.text,/Reply content/);
 assert.equal(parsed.attachments[0].content.toString(),'synthetic attachment');
});
