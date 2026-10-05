"""Local browser-test fixture; no model, GPU, credentials or remote services."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import server
from test_duration import score

server.gpu_info=lambda:{'ok':True,'name':'Browser test fixture (no GPU run)','vram_gb':6}
server.upload_audio=lambda name,blob:'fixture.wav'
server.JOBS['failed']={'state':'failed','error':'fixture error'}
count=0

def start_job(kind,graph,lang):
    global count
    count+=1;key=str(count)
    if kind=='scan':server.JOBS[key]={'state':'done','abc':score(),'took':0}
    else:
        duration=graph['2']['inputs']['max_duration']
        server.JOBS[key]={'state':'done','files':{'mp3':'/fixture.mp3'},'took':0,
                          'requested_seconds':duration,'warning_code':'duration_limit','graph':graph}
    return key
server.start_job=start_job
with server.Server(('127.0.0.1',0),server.Handler) as http:
    print(http.server_address[1],flush=True);http.serve_forever()
