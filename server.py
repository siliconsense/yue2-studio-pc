"""Локальный сервер студии.

Устройство: наш интерфейс в браузере -> этот сервер -> движок ComfyUI без окна.
Человек движка не видит и о нём не знает. Мы им пользуемся потому, что у него
родная поддержка модели и, в отличие от официального пакета, он не требует
flash attention, которого в сборках PyTorch под Windows нет.

Без веб-фреймворков, только стандартная библиотека: лишняя зависимость на чужой
машине — лишний повод не запуститься.
"""
import http.server, json, os, socketserver, subprocess, sys, threading, time, traceback
import urllib.error, urllib.parse, urllib.request, webbrowser
from pathlib import Path

HERE = Path(__file__).resolve().parent
UI = HERE / "ui"
ENGINE = HERE / "engine"
PORT = 8737            # наш интерфейс
ENGINE_PORT = 8188     # движок, только на локальной петле
ENGINE_URL = f"http://127.0.0.1:{ENGINE_PORT}"

JOBS = {}
_engine = None
_schema = None


def log(msg):
    print(msg, flush=True)


# ---------------------------------------------------------------- движок

def engine_start():
    """Поднять движок без окна. Он пишет в наш же вывод, чтобы ошибки были видны."""
    global _engine
    if _engine and _engine.poll() is None:
        return
    cmd = [sys.executable, "main.py",
           "--listen", "127.0.0.1", "--port", str(ENGINE_PORT),
           "--disable-auto-launch"]
    log(tr(CONSOLE_LANG, "c_engine_go"))
    _engine = subprocess.Popen(cmd, cwd=str(ENGINE))


def engine_wait(timeout=600):
    """Движок грузится долго: читает модели, строит списки узлов."""
    t0 = time.time()
    while time.time() - t0 < timeout:
        if _engine and _engine.poll() is not None:
            raise RuntimeError("движок завершился на старте, смотрите сообщения выше")
        try:
            with urllib.request.urlopen(ENGINE_URL + "/object_info", timeout=5) as r:
                if r.status == 200:
                    log(tr(CONSOLE_LANG, "c_engine_ok").format(n=round(time.time()-t0)))
                    return json.load(r)
        except Exception:
            time.sleep(2)
    raise RuntimeError("движок не ответил за отведённое время")


def api(path, payload=None, timeout=30):
    url = ENGINE_URL + path
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data,
                                 headers={"Content-Type": "application/json"} if data else {})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def need_nodes(schema, names):
    """Проверяем наличие узлов ДО запуска задачи: иначе человек ждёт минуту,
    чтобы получить невнятную ошибку от движка."""
    missing = [n for n in names if n not in schema]
    if missing:
        raise RuntimeError("движок не знает узлов: " + ", ".join(missing) +
                           ". Похоже, версия старая — удалите папку engine и запустите start.bat заново.")



# ------------------------------------------------------- схемы для движка

CKPT = "yue2_3b_int8_convrot.safetensors"
ENCODER = "sheetsage2_bf16.safetensors"

# Значения сэмплера взяты из официальной схемы модели, не выдуманы.
SAMPLER = dict(steps=32, cfg=1, sampler_name="dpm_2", scheduler="sgm_uniform", denoise=1)



def graph_song(style, lyrics, abc, seed, seconds, cfg_scale=None):
    """Текст -> песня. Если подана партитура, режим меняется на «по мелодии»:
    именно так делает официальная схема каверов."""
    mode = "melody" if abc.strip() else "full"
    # Значения сэмплирования совпадают с официальным шаблоном кавера Comfy-Org
    # (audio_yue2_music_cover.json). Трогать их не нужно: мы это проверили и получили
    # шипение. Кавер разваливается не из-за них, а из-за несовпадения числа нот
    # в музыкальной фразе и числа слогов в строке — подгонку делает интерфейс.
    gen = {"clip": ["1", 1], "style": style, "lyrics": lyrics, "abc": abc,
           "seed": seed, "mode": mode, "max_duration": float(seconds),
           "temperature": 1.0, "top_p": 0.95, "top_k": 100, "repetition_penalty": 1.2}
    if cfg_scale:
        gen["cfg_scale"] = float(cfg_scale)
    return {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": CKPT}},
        "2": {"class_type": "YuE2GenerateMusic", "inputs": gen},
        # Длину задаёт не человек, а сама модель: выход 1 — сколько получилось секунд.
        "3": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["2", 0]}},
        "4": {"class_type": "EmptyYuE2LatentAudio", "inputs": {"seconds": ["2", 1], "batch_size": 1}},
        "5": {"class_type": "KSampler", "inputs": dict(model=["1", 0], positive=["2", 0],
              negative=["3", 0], latent_image=["4", 0], seed=seed, **SAMPLER)},
        "6": {"class_type": "VAEDecodeAudio", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
        # Сохраняем оба формата сразу. Декодирование уже позади, кодирование стоит
        # секунду, зато человеку не нужно заранее выбирать и потом переделывать:
        # mp3 играет везде, flac остаётся без потерь для дальнейшей работы.
        "7": {"class_type": "SaveAudio", "inputs": {"audio": ["6", 0], "filename_prefix": "audio/SiliconSense"}},
        # Узел помечен в движке устаревшим, но рабочий и простой: у замены качество
        # задаётся вложенным полем. Версия движка закреплена в start.bat, так что
        # он никуда не денется до того, как мы сами поднимем метку.
        "8": {"class_type": "SaveAudioMP3", "inputs": {"audio": ["6", 0], "filename_prefix": "audio/SiliconSense",
                                                       "quality": "320k"}},
    }


def graph_scan(filename, mode="melody"):
    """Запись -> партитура. Отдельной задачей, а не куском кавера: человеку нужно
    увидеть ноты и поправить их, прежде чем петь."""
    return {
        "11": {"class_type": "AudioEncoderLoader", "inputs": {"audio_encoder_name": ENCODER}},
        "10": {"class_type": "LoadAudio", "inputs": {"audio": filename}},
        "12": {"class_type": "SheetSage2AudioToABC",
               "inputs": {"audio_encoder": ["11", 0], "audio": ["10", 0], "mode": mode}},
        "13": {"class_type": "PreviewAny", "inputs": {"source": ["12", 0]}},
    }


def upload_audio(name, blob):
    """Движок принимает файлы на /upload/image — поле называется image, но проверки
    типа там нет, звук проходит. Расширение должно быть настоящим аудио."""
    boundary = "----siliconsense" + str(int(time.time() * 1000))
    body = b""
    body += f"--{boundary}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"{name}\"\r\n".encode()
    body += b"Content-Type: application/octet-stream\r\n\r\n" + blob + b"\r\n"
    for field, val in (("type", "input"), ("overwrite", "true")):
        body += f"--{boundary}\r\nContent-Disposition: form-data; name=\"{field}\"\r\n\r\n{val}\r\n".encode()
    body += f"--{boundary}--\r\n".encode()
    req = urllib.request.Request(ENGINE_URL + "/upload/image", data=body,
                                 headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)["name"]


def find_text(entry):
    """Партитура возвращается как текст предпросмотра, а не файлом."""
    for out in (entry.get("outputs") or {}).values():
        for key in ("text", "string", "value"):
            v = out.get(key)
            if isinstance(v, list) and v and isinstance(v[0], str):
                return "\n".join(v)
            if isinstance(v, str):
                return v
    return None


# ---------------------------------------------------------------- задачи

def fetch_audio(prompt_id):
    """Достать готовые файлы: в истории лежат имена, сами файлы отдаются по /view.
    Их несколько — по одному на каждый формат сохранения."""
    hist = api(f"/history/{prompt_id}")
    entry = hist.get(prompt_id) or {}
    out = []
    for node_out in (entry.get("outputs") or {}).values():
        for key in ("audio", "audios"):
            for item in (node_out.get(key) or []):
                q = (f"/view?filename={urllib.parse.quote(item['filename'])}"
                     f"&subfolder={urllib.parse.quote(item.get('subfolder',''))}"
                     f"&type={urllib.parse.quote(item.get('type','output'))}")
                with urllib.request.urlopen(ENGINE_URL + q, timeout=120) as r:
                    out.append((item["filename"], r.read()))
    return out


def track(job_id, prompt_id, kind, label):
    j = JOBS[job_id]
    lang = j.get("lang", "en")
    t0 = time.time()
    while True:
        if _engine and _engine.poll() is not None:
            j.update(state="failed", error=tr(lang, "engine_gone"))
            return
        try:
            hist = api(f"/history/{prompt_id}", timeout=10)
        except Exception:
            time.sleep(1.5); continue
        entry = hist.get(prompt_id)
        if entry:
            status = entry.get("status") or {}
            if status.get("status_str") == "error":
                msg = json.dumps(status.get("messages", []), ensure_ascii=False)
                j.update(state="failed", error=human_error(msg, lang))
                return
            if status.get("completed"):
                if kind == "scan":
                    abc = find_text(entry)
                    if abc:
                        j.update(state="done", abc=abc, took=round(time.time() - t0))
                        log(tr(CONSOLE_LANG, "c_scan_done").format(id=job_id, n=j["took"]))
                        return
                else:
                    got = fetch_audio(prompt_id)
                    if got:
                        out = HERE / "songs"; out.mkdir(exist_ok=True)
                        files = {}
                        for name, blob in got:
                            ext = (name or "x.flac").rsplit(".", 1)[-1].lower()
                            path = out / f"{job_id}.{ext}"
                            path.write_bytes(blob)
                            files[ext] = f"/songs/{path.name}"
                        # Играем mp3: он открывается в любом браузере и весит меньше.
                        j.update(state="done", files=files,
                                 file=files.get("mp3") or next(iter(files.values())),
                                 took=round(time.time() - t0))
                        log(tr(CONSOLE_LANG, "c_song_done").format(id=job_id, n=j["took"]))
                        return
                j.update(state="failed", error=tr(lang, "no_result"))
                return
        j["message"] = f"{label}… {round(time.time()-t0)} {tr(lang, 'sec')}"
        time.sleep(1.5)


# Всё, что видит человек, живёт здесь на двух языках. Движок сыплет английскими
# простынями — самое частое переводим, остальное отдаём как есть.
STR = {
    "ru": {
        "sec":          "с",
        "c_engine_go":  "[движок] запускаю…",
        "c_engine_ok":  "[движок] готов за {n} с",
        "c_scan_done":  "[готово] {id}: партитура за {n} с",
        "c_song_done":  "[готово] {id}: {n} с",
        "c_card":       "[карта] {name}, {gb} ГБ",
        "c_card_bad":   "[карта] не определилась: {err}",
        "c_open":       "[сервер] открываю {url}",
        "c_enter":      "Нажмите Enter, чтобы закрыть…",
        "song_label":   "Пишу песню",
        "scan_label":   "Снимаю партитуру",
        "engine_gone":  "движок остановился",
        "no_result":    "движок закончил, но результата не отдал",
        "not_accepted": "движок не принял задание: ",
        "no_job_id":    "движок не вернул номер задания",
        "bad_request":  "не разобрал запрос",
        "need_both":    "нужны и стиль, и текст",
        "empty_file":   "пустой файл",
        "file_refused": "движок не принял файл: ",
        "no_route":     "нет такого адреса",
        "no_job":       "нет такой задачи",
        "oom":          "Не хватило видеопамяти. Закройте игры, тяжёлые вкладки браузера и другие "
                        "программы, использующие видеокарту, либо возьмите песню покороче.",
        "no_ckpt":      "Не найден файл модели. Запустите start.bat заново, он докачает.",
        "engine_error": "Движок вернул ошибку: ",
        "no_cuda":      "CUDA не найдена — видеокарта NVIDIA не видна",
    },
    "en": {
        "sec":          "s",
        "c_engine_go":  "[engine] starting…",
        "c_engine_ok":  "[engine] ready in {n} s",
        "c_scan_done":  "[done] {id}: melody in {n} s",
        "c_song_done":  "[done] {id}: {n} s",
        "c_card":       "[card] {name}, {gb} GB",
        "c_card_bad":   "[card] not detected: {err}",
        "c_open":       "[server] opening {url}",
        "c_enter":      "Press Enter to close…",
        "song_label":   "Writing the song",
        "scan_label":   "Transcribing the melody",
        "engine_gone":  "the engine stopped",
        "no_result":    "the engine finished but returned nothing",
        "not_accepted": "the engine rejected the job: ",
        "no_job_id":    "the engine returned no job id",
        "bad_request":  "could not read the request",
        "need_both":    "both style and lyrics are required",
        "empty_file":   "empty file",
        "file_refused": "the engine rejected the file: ",
        "no_route":     "no such address",
        "no_job":       "no such job",
        "oom":          "Not enough video memory. Close games, heavy browser tabs and other "
                        "programs using the graphics card, or pick a shorter song.",
        "no_ckpt":      "Model file not found. Run start.bat again, it will download it.",
        "engine_error": "The engine returned an error: ",
        "no_cuda":      "CUDA not found — no NVIDIA graphics card is visible",
    },
}


def tr(lang, key):
    d = STR.get(lang) or STR["en"]
    return d.get(key) or STR["en"][key]


CONSOLE_LANG = "ru" if str(os.environ.get("SS_LANG", "")).lower().startswith("ru") else "en"


def pick_lang(value):
    return "ru" if str(value or "").lower().startswith("ru") else "en"


def human_error(msg, lang="en"):
    low = msg.lower()
    if "out of memory" in low or "outofmemory" in low:
        return tr(lang, "oom")
    if "not found" in low and "ckpt" in low:
        return tr(lang, "no_ckpt")
    return tr(lang, "engine_error") + msg[:400]


def start_job(kind, graph, lang):
    label = tr(lang, "song_label" if kind == "song" else "scan_label")
    job_id = time.strftime("%H%M%S") + "-" + str(int(time.time() * 1000) % 1000)
    JOBS[job_id] = {"state": "running", "message": label, "lang": lang}
    try:
        r = api("/prompt", {"prompt": graph})
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:400]
        JOBS[job_id].update(state="failed", error=tr(lang, "not_accepted") + detail)
        return job_id
    pid = r.get("prompt_id")
    if not pid:
        JOBS[job_id].update(state="failed", error=tr(lang, "no_job_id"))
        return job_id
    threading.Thread(target=track, args=(job_id, pid, kind, label), daemon=True).start()
    return job_id


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(HERE), **kw)

    def log_message(self, *a):
        pass

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(n)
        if self.path == "/api/generate":
            lang = pick_lang(self.headers.get("X-Lang"))
            try:
                d = json.loads(raw or b"{}")
            except Exception:
                return self._json(400, {"error": tr(lang, "bad_request")})
            lang = pick_lang(d.get("lang") or lang)
            style = (d.get("style") or "").strip()
            lyrics = (d.get("lyrics") or "").strip()
            if not style or not lyrics:
                return self._json(400, {"error": tr(lang, "need_both")})
            g = graph_song(style, lyrics, (d.get("abc") or "").strip(),
                           int(d.get("seed") or 0) or int(time.time()) % 100000,
                           float(d.get("seconds") or 120), d.get("cfg_scale"))
            return self._json(200, {"id": start_job("song", g, lang)})

        if self.path == "/api/scan":
            # Файл приходит целиком: на локальной машине это проще и надёжнее,
            # чем возиться с кусками, а размеры тут домашние.
            lang = pick_lang(self.headers.get("X-Lang"))
            name = urllib.parse.unquote(self.headers.get("X-Filename", "source.mp3"))
            if not raw:
                return self._json(400, {"error": tr(lang, "empty_file")})
            try:
                uploaded = upload_audio(name, raw)
            except Exception as e:
                return self._json(500, {"error": tr(lang, "file_refused") + str(e)})
            g = graph_scan(uploaded, "melody")
            return self._json(200, {"id": start_job("scan", g, lang)})

        return self._json(404, {"error": tr(pick_lang(self.headers.get("X-Lang")), "no_route")})

    def do_GET(self):
        # Настоящий редирект, а не подмена пути: иначе браузер ищет файлы
        # страницы не в той папке (наступали).
        if self.path in ("/", "") or self.path.startswith("/?"):
            self.send_response(302)
            self.send_header("Location", "/ui/index.html")
            self.end_headers()
            return
        if self.path.startswith("/api/status/"):
            j = JOBS.get(self.path.rsplit("/", 1)[-1])
            return self._json(200 if j else 404, j or {"error": tr("en", "no_job")})
        if self.path == "/api/gpu":
            return self._json(200, gpu_info())
        return super().do_GET()

    def end_headers(self):
        # Без этого браузер кэширует страницу «на своё усмотрение»: заголовков
        # кэширования у SimpleHTTPRequestHandler нет, и после обновления студии
        # человек видит старый интерфейс, пока не нажмёт Ctrl+F5. Наступали.
        if not self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-cache, must-revalidate")
        super().end_headers()


def gpu_info():
    try:
        import torch
        if not torch.cuda.is_available():
            return {"ok": False, "error": "CUDA not found / CUDA не найдена"}
        p = torch.cuda.get_device_properties(0)
        return {"ok": True, "name": p.name, "vram_gb": round(p.total_memory / 1024**3, 1)}
    except Exception as e:
        return {"ok": False, "error": str(e)}


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    g = gpu_info()
    log(tr(CONSOLE_LANG, "c_card").format(name=g["name"], gb=g["vram_gb"]) if g.get("ok")
        else tr(CONSOLE_LANG, "c_card_bad").format(err=g.get("error")))
    engine_start()
    try:
        _schema = engine_wait()
    except Exception as e:
        log(f"[engine] {e}")
        input(tr(CONSOLE_LANG, "c_enter"))
        sys.exit(1)
    url = f"http://127.0.0.1:{PORT}/"
    log(tr(CONSOLE_LANG, "c_open").format(url=url))
    threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    try:
        with Server(("127.0.0.1", PORT), Handler) as httpd:
            httpd.serve_forever()
    finally:
        if _engine and _engine.poll() is None:
            _engine.terminate()
