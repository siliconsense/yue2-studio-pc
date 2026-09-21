"""Скачивание моделей в папки движка.

Отдельным файлом, потому что это самое хрупкое место: связь рвётся, HuggingFace
из России отвечает через раз. Поэтому повторные попытки, таймаут на молчащее
соединение и зеркало. Скачанное не теряется, докачка идёт с места обрыва.
"""
import os, sys, time
from pathlib import Path

LANG = "ru" if str(os.environ.get("SS_LANG", "")).lower().startswith("ru") else "en"
T = {
    "ru": {"have": "{h}: уже на месте", "try": "{h}: попытка {a} из {n}", "main": "основной адрес",
           "ok": "{h}: готово", "brk": "обрыв: {e}", "again": "продолжу с места обрыва через 5 секунд…",
           "fail": "не смог докачать: {h}", "rerun": "Запустите start.bat ещё раз — скачанное сохранилось.",
           "all": "все файлы на месте",
           "model": "модель, 3.7 ГБ", "enc": "снятие партитуры, 1.3 ГБ"},
    "en": {"have": "{h}: already here", "try": "{h}: attempt {a} of {n}", "main": "main address",
           "ok": "{h}: done", "brk": "connection dropped: {e}", "again": "resuming where it stopped in 5 seconds…",
           "fail": "could not finish downloading: {h}", "rerun": "Run start.bat again — what was downloaded is kept.",
           "all": "all files are in place",
           "model": "model, 3.7 GB", "enc": "melody transcription, 1.3 GB"},
}


def t(key, **kw):
    return T[LANG][key].format(**kw)


HERE = Path(__file__).resolve().parent
MODELS = HERE / "engine" / "models"

# Сборка в int8 вдвое меньше обычной и на 6 ГБ помещается с запасом.
# sheetsage нужен только для каверов — снимает мелодию с записи.
FILES = [
    ("Comfy-Org/YuE2", "checkpoints/yue2_3b_int8_convrot.safetensors", "checkpoints", "model"),
    ("Comfy-Org/YuE2", "audio_encoders/sheetsage2_bf16.safetensors", "audio_encoders", "enc"),
]

MIRRORS = [None, "https://hf-mirror.com"]
TRIES = 8


def pull(repo, path, dest_dir):
    from huggingface_hub import hf_hub_download
    dest = MODELS / dest_dir
    dest.mkdir(parents=True, exist_ok=True)
    return hf_hub_download(repo_id=repo, filename=path, local_dir=str(dest.parent),
                           resume_download=True, etag_timeout=30)


def main():
    os.environ.setdefault("HF_HUB_DOWNLOAD_TIMEOUT", "30")   # молчащее соединение рвём сами
    MODELS.mkdir(parents=True, exist_ok=True)
    for repo, path, dest_dir, human_key in FILES:
        human = t(human_key)
        target = MODELS / path
        if target.exists() and target.stat().st_size > 1_000_000:
            print("[models] " + t("have", h=human), flush=True)
            continue
        ok = False
        for attempt in range(1, TRIES + 1):
            endpoint = MIRRORS[min((attempt - 1) // 4, len(MIRRORS) - 1)]
            if endpoint:
                os.environ["HF_ENDPOINT"] = endpoint
            else:
                os.environ.pop("HF_ENDPOINT", None)
            try:
                print("[models] " + t("try", h=human, a=attempt, n=TRIES)
                      + " / " + (endpoint or t("main")), flush=True)
                pull(repo, path, dest_dir)
                print("[models] " + t("ok", h=human), flush=True)
                ok = True
                break
            except KeyboardInterrupt:
                raise
            except Exception as e:
                print("[models] " + t("brk", e=f"{type(e).__name__}: {str(e)[:150]}"), flush=True)
                if attempt < TRIES:
                    print("[models] " + t("again"), flush=True)
                    time.sleep(5)
        if not ok:
            print("[models] " + t("fail", h=human), flush=True)
            print("[models] " + t("rerun"), flush=True)
            return 1
    (MODELS / ".done").write_text("ok", encoding="utf-8")
    print("[models] " + t("all"), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
