import json
import math
from pathlib import Path
import subprocess
import tempfile
import threading
import unittest
from unittest.mock import patch
import urllib.request
import urllib.error

from duration import generation_seconds, score_seconds, DurationError
import server
from engine_nodes.studio_generation_info import SiliconSenseYuE2GenerationInfo


def score(bars=120, tempo=120):
    return f'X:1\nM:4/4\nL:1/4\nQ:1/4={tempo}\nV:1\nV:2\nK:C\nV:1\n' + 'C4|' * bars + '\nV:2\n' + 'z4|' * bars


class DurationTests(unittest.TestCase):
    def test_auto_long_cover_and_tempo(self):
        self.assertEqual(generation_seconds(score()), 245)
        self.assertEqual(generation_seconds(score(120, 60)), 485)
        self.assertEqual(generation_seconds(score(90)), 185)

    def test_manual_and_song_compatibility(self):
        self.assertEqual(generation_seconds('', None), 120)
        self.assertEqual(generation_seconds('', 60), 60)
        for seconds in [120, 240, 360, 900]:
            self.assertEqual(generation_seconds(score(), seconds), seconds)

    def test_invalid_budgets(self):
        for value in [0, -1, 901, 'nan', 'inf', [], {}, True, '']:
            with self.subTest(value=value), self.assertRaises(DurationError):
                generation_seconds(score(), value)
        with self.assertRaisesRegex(DurationError, 'score_too_long'):
            generation_seconds(score(500))

    def test_meter_rests_ties_chords_multiple_voices(self):
        abc='X:1\nM:6/8\nL:1/8\nQ:3/8=60\nV:1\nV:2\nK:C\nV:1\n"C"C3-C3|Z2|\nV:2\nz6|'
        self.assertEqual(score_seconds(abc), 6)
        self.assertEqual(score_seconds('X:1\nM:4/4\nL:1/8\nQ:120\nK:C\nC/2D/EF2z4|'),2)

    def test_unsupported_timing_not_guessed(self):
        for body in ['|:C4:|', '(3CDE', '[Q:60]C4', '[CEG]4', 'C>D', 'Z0', '']:
            with self.subTest(body=body), self.assertRaises(DurationError):
                score_seconds('X:1\nL:1/4\nQ:1/4=120\nK:C\n'+body)
        self.assertEqual(generation_seconds('unsupported score', 240), 240)

    def test_real_editor_roundtrip_matches_server(self):
        js="const PR=require('./ui/pianoroll.js');let s=PR.parse(process.argv[1]);s.tempo=80;console.log(PR.build(s))"
        abc=subprocess.check_output(['node','-e',js,score(120)],text=True)
        self.assertEqual(generation_seconds(abc),365)

    def test_node_reports_actual_truncation_not_natural_ending(self):
        node=SiliconSenseYuE2GenerationInfo()
        for frames,truncated,code in [(6000,True,'duration_limit'),(5000,True,'context_limit'),(5000,False,None),(6000,False,None)]:
            payload=node.report([[None,{'yue2_frames':frames,'yue2_truncated':truncated}]],240)
            info=server.generation_info({'outputs':{'9':payload['ui']}})
            self.assertEqual(info['warning_code'],code)
            self.assertEqual(info['seconds'],frames/25)

    def test_tracker_preserves_audio_and_reports_limit(self):
        info = SiliconSenseYuE2GenerationInfo().report(
            [[None, {'yue2_frames': 5000, 'yue2_truncated': True}]], 240)
        entry = {'status': {'completed': True}, 'outputs': {'9': info['ui']}}
        with tempfile.TemporaryDirectory() as folder, patch.object(server, 'HERE', Path(folder)), \
             patch.object(server, 'api', return_value={'prompt': entry}), \
             patch.object(server, 'fetch_audio', return_value=[('output.mp3', b'audio fixture')]), \
             patch.object(server, 'log'):
            server.JOBS['test-track'] = {'lang': 'ru'}
            try:
                server.track('test-track', 'prompt', 'song', 'test')
                result = server.JOBS['test-track']
                self.assertEqual(result['state'], 'done')
                self.assertEqual(result['warning_code'], 'context_limit')
                self.assertIn('контекст', result['warning'])
                self.assertEqual(result['seconds'], 200)
                self.assertEqual((Path(folder)/'songs/test-track.mp3').read_bytes(), b'audio fixture')
            finally:
                server.JOBS.pop('test-track', None)

    def test_report_node_installs_into_existing_engine_without_touching_other_nodes(self):
        with tempfile.TemporaryDirectory() as d, patch.object(server,'ENGINE',Path(d)):
            custom=Path(d)/'custom_nodes';custom.mkdir();other=custom/'unrelated.py';other.write_text('keep')
            server.install_report_node();server.install_report_node()
            self.assertEqual(other.read_text(),'keep')
            self.assertEqual((custom/'siliconsense_yue2_info.py').read_bytes(),Path('engine_nodes/studio_generation_info.py').read_bytes())


class HTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.http=server.Server(('127.0.0.1',0),server.Handler)
        cls.thread=threading.Thread(target=cls.http.serve_forever,daemon=True);cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown();cls.http.server_close();cls.thread.join()

    def post(self,body):
        request=urllib.request.Request(f'http://127.0.0.1:{self.http.server_address[1]}/api/generate',data=json.dumps(body).encode(),headers={'Content-Type':'application/json'})
        try:
            with urllib.request.urlopen(request) as r:return r.status,json.load(r)
        except urllib.error.HTTPError as e:
            with e:return e.code,json.load(e)

    def test_cover_request_without_seconds_is_automatic(self):
        with patch.object(server,'start_job',return_value='test') as job:
            status,_=self.post({'style':'folk','lyrics':'test','abc':score()})
            self.assertEqual(status,200)
            graph=job.call_args.args[1]
            self.assertEqual(graph['2']['inputs']['max_duration'],245)
            self.assertEqual(graph['4']['inputs']['seconds'],['2',1])
            self.assertEqual(graph['9']['inputs']['requested_seconds'],245)
            self.assertEqual(graph['2']['inputs']['top_p'],0.95)
            self.assertEqual(graph['5']['inputs']['steps'],32)

    def test_manual_and_invalid_requests_do_not_launch_gpu(self):
        with patch.object(server,'start_job',return_value='test') as job:
            body={'style':'folk','lyrics':'test','abc':score(),'seconds':360}
            self.assertEqual(self.post(body)[0],200)
            self.assertEqual(job.call_args.args[1]['2']['inputs']['max_duration'],360)
            for value in [None,False,-1,901,'NaN']:
                bad=[] if value is None else {**body,'seconds':value}
                job.reset_mock();status,response=self.post(bad)
                self.assertEqual(status,400);self.assertIn('error',response);job.assert_not_called()


if __name__=='__main__':unittest.main()
