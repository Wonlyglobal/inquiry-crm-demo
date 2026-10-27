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
 width=1200;height=900;page_number=1;rotation=0
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

test('extractor refuses rotated pages and field overflow instead of hiding later candidates',()=>{
 const code=String.raw`import importlib.util,json,sys
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('native','scripts/prepare-private-product-evidence.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def word(t,x,y,size=12):return dict(text=t,x0=x,x1=x+len(t)*6,top=y,bottom=y+size,size=size)
class Page:
 width=1200;height=900;page_number=1
 def __init__(self,words,rotation=0):self.words=words;self.rotation=rotation
 def extract_words(self,**kwargs):return self.words
def words(x=20):return [word('AX100 Pro',x,100,26),word('Synthetic overview',x,180),word('Dimensions',x,340),word('Door thickness 40-80mm',x,560),word('Key Features',x,710),word('Synthetic keypad',x,750)]
def refuses(page):
 try:m.extract_panel(page,'AX100 Pro')
 except ValueError:return True
 return False
for rotation in [90,180,270,None]:assert refuses(Page(words(),rotation))
# Five candidate groups include a later conflicting value. Never return the first four.
overflow=words()+[word('Door thickness 40/80mm',20,580),word('Door thickness 90-100mm',20,600)]
assert refuses(Page(overflow))
edge=words()+[word('Door thickness 41-81mm',20,580)]
assert len(m.extract_panel(Page(edge),'AX100 Pro'))==4
at_middle=m.extract_panel(Page(words(600)),'AX100 Pro')
assert len(at_middle)==3 and all(r['panel_bbox'][0]==600 for r in at_middle)
print(json.dumps({'checks':7,'synthetic_only':True}))`;
 const result=JSON.parse(execFileSync('python3',['-c',code],{cwd:new URL('..',import.meta.url),encoding:'utf8'}));
 assert.equal(result.checks,7);assert.equal(result.synthetic_only,true);
});

test('extractor main binds one immutable source snapshot and refuses invalid batches before writing',()=>{
 // All source/output I/O and the PDF parser are replaced in memory. No private
 // path or PDF is opened, and no bundle is written by this synthetic CLI test.
 const code=String.raw`import contextlib,importlib.util,io,json,sys,types
from unittest.mock import patch
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('native','scripts/prepare-private-product-evidence.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
original=b'SYNTHETIC ORIGINAL SOURCE SNAPSHOT'
sha=m.hashlib.sha256(original).hexdigest()
models=['AX100 Pro','AX200 Pro','AX300 Pro','AX400 Pro','AX500 Pro']
def word(t,x,y,size=12):return dict(text=t,x0=x,x1=x+len(t)*6,top=y,bottom=y+size,size=size)
class Page:
 width=1200;height=900;rotation=0
 def __init__(self,model,number):self.model=model;self.page_number=number
 def extract_words(self,**kwargs):return [word(self.model,20,100,26),word('Synthetic overview',20,180),word('Dimensions',20,340),word('Door thickness 40-80mm',20,670),word('Key Features',20,710),word('Synthetic keypad',20,750)]
class PDF:
 def __enter__(self):return types.SimpleNamespace(pages=[Page(model,i+1) for i,model in enumerate(models)])
 def __exit__(self,*args):return False
writes=[];reads=[];opened=[]
def read_source(path):
 reads.append(str(path))
 return original if len(reads)==1 else b'CHANGED SYNTHETIC SOURCE'
def open_pdf(stream):
 assert isinstance(stream,io.BytesIO) and stream.getvalue()==original
 opened.append(True)
 return PDF()
def write_bundle(path,raw):writes.append(raw);return len(raw)
def invoke(requested,expected_sha=sha):
 reads.clear();opened.clear();before=len(writes)
 args=['synthetic','--source','/synthetic/source.pdf','--sha256',expected_sha,'--edition','V9','--output','/synthetic/agent-intelligence-private/bundle.json']
 for model in requested:args.extend(['--model',model])
 try:
  with patch.object(sys,'argv',args),contextlib.redirect_stdout(io.StringIO()):m.main()
 except ValueError:
  assert len(writes)==before
  return None
 assert len(reads)==1 and len(opened)==1 and len(writes)==before+1
 return json.loads(writes[-1])
with patch.object(m.Path,'resolve',lambda p:p),patch.object(m.Path,'exists',lambda p:False),patch.object(m.Path,'read_bytes',read_source),patch.object(m.Path,'mkdir',lambda *a,**k:None),patch.object(m.Path,'write_bytes',write_bundle),patch.dict(sys.modules,{'pdfplumber':types.SimpleNamespace(open=open_pdf)}):
 bundle=invoke(models)
 assert len(bundle['documents'])==5
 for d in bundle['documents']:
  pe=d['product_evidence'];assert d['source_sha256']==pe['source_sha256']==sha
  assert all(r['source_sha256']==sha for r in pe['regions'])
  expected='product-'+m.hashlib.sha256(('grace-product-page-evidence-v1|'+sha+'|'+m.canonical(pe['model'])).encode()).hexdigest()
  assert d['key']==expected
 assert invoke(models+['AX600 Pro']) is None and not opened
 assert invoke(['AX100 Pro','AX100 / Pro']) is None and not opened
 assert invoke(['AX100 Pro'],'b'*64) is None and not opened
 assert invoke(['AX100 Pro','AX900 Pro']) is None
 assert len(writes)==1
print(json.dumps({'checks':6,'synthetic_only':True}))`;
 const result=JSON.parse(execFileSync('python3',['-c',code],{cwd:new URL('..',import.meta.url),encoding:'utf8'}));
 assert.equal(result.checks,6);assert.equal(result.synthetic_only,true);
});
