import json,pathlib,sys,tempfile,types,unittest
from unittest.mock import patch
import analyze

class OpeningEvidence(unittest.TestCase):
 def test_opening_and_bounds(self):
  for duration in [.0001,.1,.5,1,2.9,3,10,60,3599,3600]:
   samples=analyze.timestamps(duration)
   self.assertLessEqual(len(samples),24)
   self.assertEqual(samples,sorted(set(samples)))
   self.assertTrue(all(0<=s<duration for s in samples))
   self.assertTrue(all(s in samples for s in [0,.5,1,1.5,2,2.5,2.9] if s<duration))
  for duration in [0,-1,3601,float('nan'),float('inf')]:
   with self.assertRaises(ValueError):analyze.timestamps(duration)
 def execute(self,audio=False,vision_failure=False,ocr_failure=False,mutate=False):
  def run(args,timeout=120):
   if args[0]=='ffprobe':return json.dumps({'format':{'duration':'10'},'streams':[{'codec_type':'audio'}] if audio else []}).encode()
   if args[0]=='tesseract':
    if ocr_failure:raise RuntimeError('synthetic OCR failure')
    return b'SYNTHETIC TEXT'
   if str(args[-1]).endswith('.png'):pathlib.Path(args[-1]).write_bytes(b'synthetic frame')
   return b''
  class Model:
   def __init__(self,*args,**kw):assert kw['local_files_only'] is True;assert kw['device']=='cpu'
   def transcribe(self,*args,**kw):return ([types.SimpleNamespace(text='synthetic speech',start=0,end=1)],None)
  with tempfile.NamedTemporaryFile() as source:
   def vision(frame):
    if mutate:pathlib.Path(source.name).write_bytes(b'changed')
    if vision_failure:raise RuntimeError('synthetic vision failure')
    return 'synthetic scene'
   with patch.dict(sys.modules,{'faster_whisper':types.SimpleNamespace(WhisperModel=Model)}),patch.object(analyze,'run',side_effect=run),patch.object(analyze,'vision',side_effect=vision):
    return analyze.analyze(source.name,'/models/local')
 def test_offline_and_provenance(self):
  result=self.execute(audio=True)
  self.assertEqual(result['schema'],2);self.assertEqual(result['parser_version'],'opening-evidence-v2');self.assertEqual(len(result['source_sha256']),64)
  self.assertEqual(result['coverage']['audio'],'transcribed');self.assertEqual(result['coverage']['opening_sample_times'],[0,.5,1,1.5,2,2.5,2.9])
  self.assertEqual(result['status'],'ready')
  for s in result['segments']:
   if s['kind']!='speech':self.assertEqual(len(s['frame_sha256']),64)
 def test_failures_are_partial_and_missing_audio_explicit(self):
  self.assertEqual(self.execute()['coverage']['audio'],'no_audio_stream')
  for option in ['vision_failure','ocr_failure']:
   result=self.execute(**{option:True});self.assertEqual(result['status'],'partial')
   self.assertGreater(result['coverage']['visual_failed_frames' if option=='vision_failure' else 'ocr_failed_frames'],0)
 def test_source_mutation_rejected(self):
  with self.assertRaisesRegex(ValueError,'source_changed'):self.execute(mutate=True)

if __name__=='__main__':unittest.main()
