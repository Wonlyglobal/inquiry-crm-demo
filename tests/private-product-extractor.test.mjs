import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
test('native panel extractor isolates model geometry and refuses crossing words',()=>{
 const code=String.raw`import importlib.util,json,sys
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('native','scripts/prepare-private-product-evidence.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def word(t,x,y,size=12):return dict(text=t,x0=x,x1=x+len(t)*6,top=y,bottom=y+size,size=size)
class Page:
 width=1200;height=900;page_number=1
 def __init__(self,words):self.words=words
 def extract_words(self,**kwargs):return self.words
words=[]
for x,model in [(20,'AX100'),(620,'AX200')]:
 words.extend([word(model,x,100,26),word('Pro',x+40,100,26),word('Native feature',x,180),word('Dimensions',x,340),word('Door thickness 40-80mm',x,670),word('Key Features',x,710),word('Synthetic keypad',x,750)])
left=m.extract_panel(Page(words),'AX100 Pro');right=m.extract_panel(Page(words),'AX200 Pro')
assert len(left)==3 and len(right)==3
assert all('AX200' not in r['native_text'] and r['panel_bbox'][2]==600 for r in left)
assert all('AX100' not in r['native_text'] and r['panel_bbox'][0]==600 for r in right)
for r in left+right:
 f=r['field'];assert r['native_text'][f['start']:f['end']]==f['quote']
cross=dict(text='crossing',x0=590,x1=650,top=200,bottom=212,size=12)
assert m.extract_panel(Page(words+[cross]),'AX100 Pro') is None
unknown=[word('ZX9000',20,800,26),word('X',80,800,26)]
assert m.extract_panel(Page(words+unknown),'AX100 Pro') is None
assert m.canonical('AX100 / Pro')=='AX100PRO'
print(json.dumps({'checks':7,'synthetic_only':True}))`;
 const result=JSON.parse(execFileSync('python3',['-c',code],{cwd:new URL('..',import.meta.url),encoding:'utf8'}));
 assert.equal(result.checks,7);assert.equal(result.synthetic_only,true);
});
