"""Optional local Qwen assistant. Stdlib only; pinned downloads, isolated runtime.

No lyrics or prompts go to a remote API. Network is used only for installing
llama.cpp and GGUF weights after the user explicitly starts the assistant.
"""
import hashlib
import json
import os
from pathlib import Path
import platform
import secrets
import shutil
import socket
import subprocess
import threading
import time
import urllib.request
import urllib.error
import zipfile

ROOT = Path(__file__).resolve().parent
TAG = 'b11429'
MODELS = {
    'qwen-4b': dict(name='Qwen3.5-4B Q4_K_M', file='Qwen3.5-4B-Q4_K_M.gguf',
        repo='unsloth/Qwen3.5-4B-GGUF', revision='e87f176479d0855a907a41277aca2f8ee7a09523',
        size=2740937888, sha256='00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4'),
    'qwen-9b': dict(name='Qwen3.5-9B Q4_K_M', file='Qwen3.5-9B-Q4_K_M.gguf',
        repo='unsloth/Qwen3.5-9B-GGUF', revision='3885219b6810b007914f3a7950a8d1b469d598a5',
        size=5680522464, sha256='03b74727a860a56338e042c4420bb3f04b2fec5734175f4cb9fa853daf52b7e8'),
}
ASSETS = [
    dict(file='llama-b11429-bin-win-cuda-12.4-x64.zip', size=264478423,
         sha256='dd6df685c1024e6aa55ca55ad35038692d5e284d4dc895e7a646c3245d3d14ff'),
    dict(file='cudart-llama-bin-win-cuda-12.4-x64.zip', size=391443627,
         sha256='8c79a9b226de4b3cacfd1f83d24f962d0773be79f1e7b75c6af4ded7e32ae1d6'),
]

class Cancelled(Exception):
    pass


def check_cancel(cancel):
    if cancel.is_set():
        raise Cancelled()


def stop_process(proc):
    if proc is not None and proc.poll() is None:
        try:
            proc.terminate()
        except ProcessLookupError:
            return
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=10)


def digest(path, cancel):
    sha = hashlib.sha256()
    with path.open('rb') as f:
        while chunk := f.read(4 * 1024 * 1024):
            check_cancel(cancel)
            sha.update(chunk)
    return sha.hexdigest()


def download(url, target, size, sha256, report, cancel):
    """Resume validated byte ranges, verify before atomic rename; retain partials."""
    target = Path(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    report('verify', target.name)
    if target.exists() and target.stat().st_size == size and digest(target, cancel) == sha256:
        return target
    partial = target.with_suffix(target.suffix + '.part')
    for attempt in range(3):
        check_cancel(cancel)
        offset = partial.stat().st_size if partial.exists() else 0
        if offset > size:
            partial.unlink(); offset = 0
        if offset == size:
            if digest(partial, cancel) == sha256:
                partial.replace(target); return target
            partial.unlink(); offset = 0
        if shutil.disk_usage(target.parent).free < size - offset + 256 * 1024**2:
            raise RuntimeError('Not enough disk space / Недостаточно места на диске')
        headers = {'User-Agent': 'SiliconSense-Studio/1.3', 'Accept-Encoding': 'identity'}
        if offset:
            headers['Range'] = f'bytes={offset}-'
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30) as r:
                if r.status == 206:
                    if not r.headers.get('Content-Range', '').startswith(f'bytes {offset}-'):
                        raise RuntimeError('Invalid download range')
                elif r.status == 200:
                    offset = 0
                else:
                    raise RuntimeError(f'Download HTTP {r.status}')
                with partial.open('ab' if offset else 'wb') as f:
                    done = offset
                    while True:
                        check_cancel(cancel)
                        chunk = r.read(1024 * 1024)
                        if not chunk:
                            break
                        done += len(chunk)
                        if done > size:
                            raise RuntimeError('Download exceeds expected size')
                        f.write(chunk)
                        report('download', f'{target.name} · {done / 1024**2:.0f} / {size / 1024**2:.0f} MB')
            report('verify', target.name)
            if partial.stat().st_size != size:
                raise RuntimeError('Incomplete download')
            if digest(partial, cancel) != sha256:
                partial.unlink()
                raise RuntimeError('SHA-256 mismatch')
            partial.replace(target)
            return target
        except Cancelled:
            raise
        except Exception:
            if attempt == 2:
                raise
            report('retry', target.name)
            if cancel.wait(2):
                raise Cancelled()


def extract_zip(archive, dest):
    """Reject paths outside the private runtime directory."""
    dest.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as z:
        for info in z.infolist():
            path = Path(info.filename.replace('\\', '/'))
            if path.is_absolute() or '..' in path.parts or ':' in info.filename:
                raise RuntimeError('Unsafe archive path')
            if (info.external_attr >> 16) & 0o170000 == 0o120000:
                raise RuntimeError('Archive symlink is not allowed')
        z.extractall(dest)


def install(model_id, report, cancel):
    if platform.system() != 'Windows' or platform.machine().lower() not in ('amd64', 'x86_64'):
        raise RuntimeError('This assistant build requires Windows x64 / Нужна Windows x64')
    runtime = ROOT / 'tools' / ('writer-' + TAG)
    stamp = runtime / 'installed.json'
    if not stamp.exists() or not list(runtime.rglob('llama-server.exe')):
        archives = []
        for asset in ASSETS:
            url = f'https://github.com/ggml-org/llama.cpp/releases/download/{TAG}/{asset["file"]}'
            archives.append(download(url, ROOT / 'tools' / 'writer-downloads' / asset['file'],
                                     asset['size'], asset['sha256'], report, cancel))
        report('install', 'llama.cpp ' + TAG)
        if shutil.disk_usage(ROOT / 'tools').free < 2 * 1024**3:
            raise RuntimeError('Need 2 GB free to unpack runtime / Нужно 2 ГБ для распаковки')
        for archive in archives:
            check_cancel(cancel)
            extract_zip(archive, runtime)
        executables = list(runtime.rglob('llama-server.exe'))
        if len(executables) != 1:
            raise RuntimeError('llama-server.exe missing or ambiguous')
        stamp.write_text(json.dumps({'release': TAG}), encoding='utf-8')
    exe = next(runtime.rglob('llama-server.exe'))
    model = MODELS[model_id]
    url = f'https://huggingface.co/{model["repo"]}/resolve/{model["revision"]}/{model["file"]}'
    weights = download(url, ROOT / 'engine' / 'models' / 'LLM' / model['file'],
                       model['size'], model['sha256'], report, cancel)
    return exe, weights


def validate(data):
    if not isinstance(data, dict):
        raise ValueError('Invalid assistant request / Неверный запрос')
    model = data.get('model', 'qwen-4b')
    language = data.get('language', 'ru')
    length = data.get('length', 'medium')
    device = data.get('device', 'auto')
    idea, genre = data.get('idea', ''), data.get('genre', '')
    if any(not isinstance(v, str) for v in (model, language, length, device)):
        raise ValueError('Invalid assistant settings / Неверные настройки помощника')
    if model not in MODELS or language not in ('ru', 'en') or length not in ('short', 'medium', 'long') or device not in ('auto', 'cpu'):
        raise ValueError('Invalid assistant settings / Неверные настройки помощника')
    if not isinstance(idea, str) or not 3 <= len(idea.strip()) <= 2000 or not isinstance(genre, str) or len(genre) > 200:
        raise ValueError('Idea: 3–2000 characters; genre: up to 200 / Идея: 3–2000 символов; жанр: до 200')
    return dict(model=model, language=language, length=length, device=device,
                idea=idea.strip(), genre=genre.strip())


def draft_fields(data):
    return ['verse_1', 'chorus'] + (['verse_2'] if data['length'] != 'short' else []) + (['bridge'] if data['length'] == 'long' else [])


def draft_schema(data):
    props = {'style': {'type': 'string', 'minLength': 3, 'maxLength': 1000}}
    for field in draft_fields(data):
        props[field] = {'type': 'array', 'minItems': 4, 'maxItems': 4,
                        'items': {'type': 'string', 'minLength': 1, 'maxLength': 240}}
    return {'type': 'object', 'properties': props, 'required': list(props), 'additionalProperties': False}


def messages(data):
    fields = ', '.join(draft_fields(data))
    if data['language'] == 'ru':
        system = f'''Ты автор русскоязычных песен. Напиши связный текст по идее пользователя.
Ответ — только JSON с полями style, {fields}.
style: одна строка НА АНГЛИЙСКОМ через запятую: Russian, жанр, характер голоса,
два-три инструмента, характер исполнения, темп с числом BPM.
Остальные поля: массивы ровно из четырёх строк НА РУССКОМ каждый.
verse_1 — первый куплет; chorus — припев с запоминающейся фразой;
verse_2, если запрошен, — развитие истории; bridge, если запрошен, — поворот мысли.
Одна строка массива — одна строка для пения. Не вставляй переносы строк и теги секций
внутрь строк. Припев запиши только один раз: программа повторит его сама.
Выбери одного рассказчика и сохраняй его лицо, время действия и смысл во всех строках.
Передавай историю через понятные действия и детали. Пиши естественные фразы,
примерно по 5–9 слов. Рифмуй, если это не ломает смысл и русскую грамматику.
Не заполняй строки повтором одного слова. Избегай нелогичных образов, канцелярита
и случайных метафор. Не добавляй объяснений, названия и ремарок для исполнителя.'''
    else:
        system = f'''Write a coherent, original English song based on the user's idea.
Return only JSON with fields style, {fields}.
style: one English comma-separated line: English, genre, vocal character,
two or three instruments, phrasing and a numeric tempo in BPM.
Every other field is an array of exactly four sung lines in English.
verse_1 introduces the story; chorus has a memorable hook; verse_2, if requested,
advances the story; bridge, if requested, adds a change of perspective.
One array item is one sung line. No embedded newlines or section tags. Write the
chorus only once: the application repeats it as needed. Keep the same narrator and
a consistent story. Use concrete actions and details, natural phrasing of roughly
5–9 words per line, and rhymes where they fit. Avoid filler and incoherent metaphors.
Do not add a title, explanations or stage directions.'''
    user = data['idea'] + ('\nGenre / sound: ' + data['genre'] if data['genre'] else '')
    return [{'role': 'system', 'content': system}, {'role': 'user', 'content': user}]


def parse_structured(text, data):
    result = json.loads(text)
    if not isinstance(result, dict) or not isinstance(result.get('style'), str) or not result['style'].strip() or len(result['style']) > 1000:
        raise ValueError('Invalid draft style / Неверный формат стиля')
    for field in draft_fields(data):
        lines = result.get(field)
        if not isinstance(lines, list) or len(lines) != 4 or any(
                not isinstance(line, str) or not line.strip() or len(line) > 240 or
                '\n' in line or '\r' in line for line in lines):
            raise ValueError('Invalid draft lines; try again / Неверный формат строк, попробуйте ещё раз')
    order = [('Verse', 'verse_1'), ('Chorus', 'chorus')]
    if data['length'] != 'short':
        order += [('Verse', 'verse_2'), ('Chorus', 'chorus')]
    if data['length'] == 'long':
        order += [('Bridge', 'bridge'), ('Chorus', 'chorus')]
    lyrics = '\n\n'.join('[' + tag + ']\n' + '\n'.join(line.strip() for line in result[field]) for tag, field in order)
    return {'style': ' '.join(result['style'].split()), 'lyrics': lyrics}




class Assistant:
    def __init__(self):
        self.cancelled = threading.Event()
        self.proc = None

    def cancel(self):
        self.cancelled.set()
        stop_process(self.proc)

    def run(self, data, report, before_load):
        exe, weights = install(data['model'], report, self.cancelled)
        check_cancel(self.cancelled)
        report('release', '')
        before_load()  # stop and reap our idle music engine before loading Qwen
        check_cancel(self.cancelled)
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        key = secrets.token_hex(24)
        cmd = [str(exe), '-m', str(weights), '--host', '127.0.0.1', '--port', str(port),
               '-c', '4096', '-np', '1', '-b', '256', '-ub', '128', '--jinja',
               '--reasoning', 'off',
               '--no-webui', '-ngl', '0' if data['device'] == 'cpu' else 'auto']
        env = os.environ.copy()
        env['LLAMA_API_KEY'] = key
        # CUDA runtime DLLs may be in a sibling directory inside the release ZIP.
        runtime = ROOT / 'tools' / ('writer-' + TAG)
        dll_dirs = sorted({str(p.parent) for p in runtime.rglob('*.dll')})
        env['PATH'] = os.pathsep.join([str(exe.parent)] + dll_dirs + [env.get('PATH', '')])
        logs = ROOT / 'logs'; logs.mkdir(exist_ok=True)
        report('load', MODELS[data['model']]['name'])
        try:
            with (logs / 'writer-runtime.log').open('wb') as log:
                self.proc = subprocess.Popen(cmd, cwd=str(exe.parent), env=env, stdout=log, stderr=log)
                deadline = time.monotonic() + 300
                while True:
                    check_cancel(self.cancelled)
                    if self.proc.poll() is not None:
                        raise RuntimeError('Qwen failed to load; see logs/writer-runtime.log. Try 4B or CPU / Qwen не загрузился: попробуйте 4B или CPU')
                    try:
                        self.request(port, key, '/health', timeout=2)
                        break
                    except (OSError, ValueError):
                        if time.monotonic() > deadline:
                            raise RuntimeError('Qwen load timeout / Истекло время загрузки Qwen')
                        self.cancelled.wait(0.5)
                report('write', '')
                result = self.request(port, key, '/v1/chat/completions', {
                    'messages': messages(data), 'max_tokens': 1800, 'temperature': 0.8,
                    'top_p': 0.9, 'stream': False,
                    'response_format': {'type': 'json_object', 'schema': draft_schema(data)}}, timeout=600)
                check_cancel(self.cancelled)
                choice = result['choices'][0]
                if choice.get('finish_reason') == 'length':
                    raise ValueError('Draft hit token limit; choose a shorter draft / Выберите более короткий текст')
                draft = parse_structured(choice['message']['content'], data)
                draft['model'] = MODELS[data['model']]['name']
                return draft
        finally:
            stop_process(self.proc)  # no resident Qwen after success, failure or cancel
            self.proc = None

    @staticmethod
    def request(port, key, path, body=None, timeout=30):
        req = urllib.request.Request(f'http://127.0.0.1:{port}{path}',
            data=json.dumps(body).encode() if body is not None else None,
            headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            with e:
                detail = e.read(1600).decode('utf-8', 'replace')
            if body is None:
                raise  # /health may return 503 while the model loads
            raise RuntimeError(f'Qwen HTTP {e.code}: {detail[:600]}') from e
