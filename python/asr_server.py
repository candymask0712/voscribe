#!/usr/bin/env python3
"""
voscribe ASR server — communicates with Electron main process via JSON over stdin/stdout.

Protocol:
  → {"_id": 1, "action": "check_model", "model_id": "..."}
  ← {"_id": 1, "status": "ok", "cached": true}
"""

import sys
import json
import os
import tempfile
import traceback

# Ensure unbuffered output
sys.stdout.reconfigure(line_buffering=True)

_model = None
_warmed_up = False


def send(data):
    json.dump(data, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")
    sys.stdout.flush()


def reply(request_id, **kwargs):
    send({"_id": request_id, **kwargs})


def reply_ok(request_id, **kwargs):
    reply(request_id, status="ok", **kwargs)


def reply_error(request_id, message):
    reply(request_id, status="error", message=message)


def handle_check_model(request_id, cmd):
    model_id = cmd.get("model_id", "mlx-community/Qwen3-ASR-1.7B-8bit")
    try:
        from huggingface_hub import snapshot_download
        snapshot_download(model_id, local_files_only=True)
        reply_ok(request_id, cached=True)
    except Exception:
        reply_ok(request_id, cached=False)


def handle_download_model(request_id, cmd):
    model_id = cmd.get("model_id", "mlx-community/Qwen3-ASR-1.7B-8bit")
    try:
        from huggingface_hub import snapshot_download
        local_path = snapshot_download(repo_id=model_id)
        reply_ok(request_id, path=local_path)
    except Exception as e:
        reply_error(request_id, str(e))


def handle_get_model_size(request_id, cmd):
    model_id = cmd.get("model_id", "mlx-community/Qwen3-ASR-1.7B-8bit")
    try:
        from huggingface_hub import model_info
        info = model_info(model_id, files_metadata=True)
        total = sum(
            s.size for s in (info.siblings or []) if s.size is not None
        )
        reply_ok(request_id, size_bytes=total)
    except Exception as e:
        reply_error(request_id, str(e))


def handle_load_model(request_id, cmd):
    global _model, _warmed_up
    model_id = cmd.get("model_id", "mlx-community/Qwen3-ASR-1.7B-8bit")
    try:
        from mlx_audio.stt.utils import load_model
        _model = load_model(model_id)
        _warmed_up = False
        # Warm up: run a silent audio through the model to trigger JIT compilation
        _warm_up()
        reply_ok(request_id)
    except Exception as e:
        reply_error(request_id, f"Failed to load model: {e}")


def _warm_up():
    global _warmed_up
    if _warmed_up or _model is None:
        return
    try:
        import numpy as np
        import soundfile as sf

        silent = np.zeros(8000, dtype=np.float32)
        tmp = tempfile.mktemp(suffix=".wav")
        sf.write(tmp, silent, 16000)
        try:
            _model.generate(tmp, max_tokens=1)
        except Exception:
            pass
        finally:
            try:
                os.unlink(tmp)
            except OSError:
                pass
        _warmed_up = True
    except Exception:
        pass


def handle_transcribe(request_id, cmd):
    global _model
    if _model is None:
        reply_error(request_id, "Model not loaded")
        return

    audio_path = cmd.get("audio_path")
    if not audio_path or not os.path.isfile(audio_path):
        reply_error(request_id, f"Audio file not found: {audio_path}")
        return

    try:
        kwargs = {}
        max_tokens = cmd.get("max_tokens", 128000)
        if max_tokens:
            kwargs["max_tokens"] = int(max_tokens)

        language = cmd.get("language", "auto")
        if language and language != "auto":
            kwargs["language"] = language

        # Context vocabulary injection via system_prompt
        context_vocab = cmd.get("context_vocab", [])
        if context_vocab:
            kwargs["system_prompt"] = ", ".join(context_vocab)

        result = _model.generate(audio_path, **kwargs)
        text = result.text.strip() if hasattr(result, "text") else str(result).strip()
        reply_ok(request_id, text=text)
    except Exception as e:
        reply_error(request_id, f"Transcription failed: {e}")
    finally:
        # Clean up audio file
        try:
            os.unlink(audio_path)
        except OSError:
            pass


def handle_ping(request_id, _cmd):
    reply_ok(request_id, message="pong")


HANDLERS = {
    "check_model": handle_check_model,
    "download_model": handle_download_model,
    "get_model_size": handle_get_model_size,
    "load_model": handle_load_model,
    "transcribe": handle_transcribe,
    "ping": handle_ping,
}


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            cmd = json.loads(line)
        except json.JSONDecodeError:
            continue

        request_id = cmd.get("_id")
        action = cmd.get("action")

        if action == "quit":
            reply_ok(request_id)
            break

        handler = HANDLERS.get(action)
        if handler:
            try:
                handler(request_id, cmd)
            except Exception as e:
                reply_error(request_id, f"Unhandled error: {e}\n{traceback.format_exc()}")
        else:
            reply_error(request_id, f"Unknown action: {action}")


if __name__ == "__main__":
    main()
