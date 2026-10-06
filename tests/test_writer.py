import hashlib
import io
import json
from pathlib import Path
import tempfile
import threading
import time
import unittest
from unittest.mock import Mock, patch
import urllib.request
import urllib.error
import zipfile

import server
import writer

DRAFT_OBJECT = {'style': 'Russian, folk, male voice, guitar, 90 BPM',
                'verse_1': ['Дом за рекой', 'Ждёт нас с тобой', 'Свет вдалеке', 'Помню во сне'],
                'chorus': ['Мы возвращаемся домой', 'Идём дорогой под луной', 'Нас ждёт наш тихий старый дом', 'Мы скоро снова запоём'],
                'verse_2': ['a', 'b', 'c', 'd'], 'bridge': ['e', 'f', 'g', 'h']}
DRAFT = json.dumps(DRAFT_OBJECT, ensure_ascii=False)


def wait_done(key):
    deadline = time.monotonic() + 3
    while time.monotonic() < deadline:
        if server.JOBS[key]['state'] != 'running' and not server.GPU_LOCK.locked():
            return server.JOBS[key]
        time.sleep(.01)
    raise AssertionError('worker did not finish')


class WriterTests(unittest.TestCase):
    def test_validation_and_prompt_language(self):
        for language in ['ru', 'en']:
            d = writer.validate({'idea': 'A real idea', 'language': language})
            self.assertIn('Russian' if language == 'ru' else 'English', writer.messages(d)[0]['content'])
        for data in [{}, {'idea': 'x'}, {'idea': 'x'*2001}, {'idea': 'hello', 'model': 'unknown'},
                     {'idea': 'hello', 'language': 'xx'}, {'idea': 'hello', 'device': 'remote'}]:
            with self.subTest(data=data), self.assertRaises(ValueError):
                writer.validate(data)

    def test_structured_draft_has_requested_length_and_identical_chorus(self):
        for length, count in [('short', 8), ('medium', 16), ('long', 24)]:
            data = writer.validate({'idea': 'song idea', 'length': length})
            draft = writer.parse_structured(DRAFT, data)
            lines = [line for line in draft['lyrics'].splitlines() if line and not line.startswith('[')]
            self.assertEqual(len(lines), count)
            self.assertEqual(draft['lyrics'].count('Мы возвращаемся домой'), {'short': 1, 'medium': 2, 'long': 3}[length])
            self.assertEqual(writer.draft_schema(data)['properties']['chorus']['maxItems'], 4)
        for broken in [{}, {'style': 'test'}, {**DRAFT_OBJECT, 'chorus': ['one']}, {**DRAFT_OBJECT, 'chorus': ['a\nb', 'c', 'd', 'e']}]:
            with self.assertRaises(ValueError):writer.parse_structured(json.dumps(broken), writer.validate({'idea': 'test idea'}))

    def test_resume_download_and_verify_hash(self):
        payload = b'abcdefghij'; sha = hashlib.sha256(payload).hexdigest()
        with tempfile.TemporaryDirectory() as folder:
            dest = Path(folder)/'model.gguf'; dest.with_suffix('.gguf.part').write_bytes(payload[:4])
            response = io.BytesIO(payload[4:]); response.status=206; response.headers={'Content-Range':'bytes 4-9/10'}
            with patch.object(writer.urllib.request,'urlopen',return_value=response) as opened:
                writer.download('https://example.test/model',dest,len(payload),sha,Mock(),threading.Event())
                self.assertEqual(opened.call_args.args[0].get_header('Range'),'bytes=4-')
            self.assertEqual(dest.read_bytes(),payload)
            with patch.object(writer.urllib.request,'urlopen') as opened:
                writer.download('https://example.test/model',dest,len(payload),sha,Mock(),threading.Event())
                opened.assert_not_called()

    def test_ignored_range_restarts_without_duplicating(self):
        payload=b'abcdef'
        with tempfile.TemporaryDirectory() as folder:
            dest=Path(folder)/'model'; dest.with_suffix('.part').write_bytes(b'ab')
            response=io.BytesIO(payload); response.status=200;response.headers={}
            with patch.object(writer.urllib.request,'urlopen',return_value=response):
                writer.download('https://example.test',dest,6,hashlib.sha256(payload).hexdigest(),Mock(),threading.Event())
            self.assertEqual(dest.read_bytes(),payload)

    def test_cancel_and_corrupt_complete_partial(self):
        with tempfile.TemporaryDirectory() as folder:
            dest=Path(folder)/'model';part=dest.with_suffix('.part');part.write_bytes(b'bad')
            cancelled=threading.Event();cancelled.set()
            with self.assertRaises(writer.Cancelled):
                writer.download('https://example.test',dest,3,'invalid',Mock(),cancelled)
            self.assertEqual(part.read_bytes(),b'bad')
            response=io.BytesIO(b'new');response.status=200;response.headers={}
            with patch.object(writer.urllib.request,'urlopen',return_value=response):
                writer.download('https://example.test',dest,3,hashlib.sha256(b'new').hexdigest(),Mock(),threading.Event())
            self.assertEqual(dest.read_bytes(),b'new')

    def test_zip_path_traversal_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            archive=Path(folder)/'runtime.zip'
            with zipfile.ZipFile(archive,'w') as z:z.writestr('../bad.exe',b'bad')
            with self.assertRaisesRegex(RuntimeError,'Unsafe'):writer.extract_zip(archive,Path(folder)/'out')
            self.assertFalse((Path(folder)/'bad.exe').exists())

    def test_process_freed_after_response_failure_and_success(self):
        for failure in [False, True]:
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as folder:
                root=Path(folder);exe=root/'llama-server.exe';exe.touch();weights=root/'model.gguf'
                proc=Mock();proc.poll.return_value=None
                answer=RuntimeError('inference failed') if failure else {'choices':[{'message':{'content':DRAFT},'finish_reason':'stop'}]}
                before=Mock()
                with patch.object(writer,'ROOT',root), patch.object(writer,'install',return_value=(exe,weights)), \
                     patch.object(writer.subprocess,'Popen',return_value=proc), patch.object(writer.Assistant,'request',side_effect=[{},answer]):
                    assistant=writer.Assistant()
                    if failure:
                        with self.assertRaisesRegex(RuntimeError,'inference failed'):
                            assistant.run(writer.validate({'idea':'A song idea'}),Mock(),before)
                    else:
                        self.assertIn('lyrics',assistant.run(writer.validate({'idea':'A song idea'}),Mock(),before))
                    before.assert_called_once();proc.terminate.assert_called_once();proc.wait.assert_called_once()
                    self.assertIsNone(assistant.proc)


class LifecycleTests(unittest.TestCase):
    def test_busy_cancel_releases_slot(self):
        class Waiting(writer.Assistant):
            def run(self,*args):
                self.cancelled.wait(2);writer.check_cancel(self.cancelled)
        with patch.object(server.writer,'Assistant',Waiting):
            key=server.start_writer(writer.validate({'idea':'test idea'}),'en')
            with self.assertRaises(server.BusyError):server.start_writer({},'en')
            with self.assertRaises(server.BusyError):server.start_job('song',{},'en')
            server.WRITERS[key].cancel()
            self.assertEqual(wait_done(key)['state'],'cancelled')
            self.assertNotIn(key,server.WRITERS)

    def test_failure_unlocks_then_music_engine_restarts(self):
        failed=Mock();failed.cancelled=threading.Event();failed.run.side_effect=RuntimeError('writer failure')
        with patch.object(server.writer,'Assistant',return_value=failed):
            key=server.start_writer(writer.validate({'idea':'test idea'}),'en')
            self.assertEqual(wait_done(key)['state'],'failed')
        engine=Mock();engine.poll.return_value=None
        def start(): server._engine=engine
        def track(key,*args): server.JOBS[key].update(state='done')
        with patch.object(server,'_engine',None),patch.object(server,'engine_start',side_effect=start) as start_mock, \
             patch.object(server,'engine_wait',return_value={'YuE2GenerateMusic':{},'SiliconSenseYuE2GenerationInfo':{}}), \
             patch.object(server,'api',return_value={'prompt_id':'ok'}),patch.object(server,'track',side_effect=track):
            key=server.start_job('song',{},'en')
            self.assertEqual(wait_done(key)['state'],'done');start_mock.assert_called_once()

    def test_scan_upload_occurs_after_engine_restart(self):
        order=[];engine=Mock();engine.poll.return_value=None
        def start():order.append('start');server._engine=engine
        def track(key,*args):server.JOBS[key].update(state='done')
        with patch.object(server,'_engine',None),patch.object(server,'engine_start',side_effect=start), \
             patch.object(server,'engine_wait',return_value={'YuE2GenerateMusic':{},'SiliconSenseYuE2GenerationInfo':{}}), \
             patch.object(server,'upload_audio',side_effect=lambda *a:order.append('upload') or 'audio.wav'), \
             patch.object(server,'api',return_value={'prompt_id':'ok'}),patch.object(server,'track',side_effect=track):
            key=server.start_job('scan',None,'en',source=('a.wav',b'abc','melody'))
            self.assertEqual(wait_done(key)['state'],'done');self.assertEqual(order,['start','upload'])


class WriterHTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.http=server.Server(('127.0.0.1',0),server.Handler)
        cls.thread=threading.Thread(target=cls.http.serve_forever,daemon=True);cls.thread.start()
    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown();cls.http.server_close();cls.thread.join()
    def post(self,body,origin=None):
        headers={'Content-Type':'application/json'}
        if origin:headers['Origin']=origin
        req=urllib.request.Request(f'http://127.0.0.1:{self.http.server_address[1]}/api/writer',data=json.dumps(body).encode(),headers=headers)
        try:
            with urllib.request.urlopen(req) as r:return r.status,json.load(r)
        except urllib.error.HTTPError as e:
            with e:return e.code,json.load(e)
    def test_input_busy_and_remote_origin(self):
        with patch.object(server,'start_writer',return_value='fixture') as start:
            self.assertEqual(self.post({'idea':'test idea'})[0],200)
            start.assert_called_once()
            for data in [[],{'idea':'a'},{'idea':'test idea','model':[]}]:self.assertEqual(self.post(data)[0],400)
            self.assertEqual(self.post({'idea':'test idea'},origin='https://example.com')[0],403)
        with patch.object(server,'start_writer',side_effect=server.BusyError('busy')):
            self.assertEqual(self.post({'idea':'test idea'})[0],409)
