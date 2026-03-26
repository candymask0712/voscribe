const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

class TranscriberBridge {
  constructor() {
    this._process = null;
    this._rl = null;
    this._pending = new Map();
    this._nextId = 0;
    this._loaded = false;
  }

  _findPython() {
    const bundled = [
      path.join(process.resourcesPath || '', 'python', 'bin', 'python3'),
      path.join(process.resourcesPath || '', 'python', 'bin', 'python3.11'),
    ];
    for (const p of bundled) {
      if (fs.existsSync(p)) return p;
    }
    return 'python3';
  }

  _findScript() {
    const candidates = [
      path.join(process.resourcesPath || '', 'python', 'asr_server.py'),
      path.join(__dirname, '..', '..', 'python', 'asr_server.py'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    throw new Error('asr_server.py not found');
  }

  start() {
    if (this._process) return;

    const python = this._findPython();
    const script = this._findScript();

    this._process = spawn(python, ['-u', script], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    });

    this._rl = readline.createInterface({ input: this._process.stdout });
    this._rl.on('line', (line) => {
      try {
        const data = JSON.parse(line);
        const id = data._id;
        if (id !== undefined && this._pending.has(id)) {
          const { resolve, reject } = this._pending.get(id);
          this._pending.delete(id);
          if (data.status === 'error') {
            reject(new Error(data.message || 'Unknown error'));
          } else {
            resolve(data);
          }
        }
      } catch {
        // non-JSON line, ignore
      }
    });

    this._process.stderr.on('data', (chunk) => {
      // Log Python stderr for debugging
      const text = chunk.toString().trim();
      if (text) console.error('[ASR]', text);
    });

    this._process.on('exit', (code) => {
      console.log(`[ASR] exited with code ${code}`);
      this._process = null;
      this._loaded = false;
      for (const [, { reject }] of this._pending) {
        reject(new Error('ASR process exited'));
      }
      this._pending.clear();
    });
  }

  _send(action, params = {}, timeoutMs = 300000) {
    return new Promise((resolve, reject) => {
      if (!this._process) this.start();

      const id = this._nextId++;
      const timer = setTimeout(() => {
        if (this._pending.has(id)) {
          this._pending.delete(id);
          reject(new Error(`Timeout: ${action}`));
        }
      }, timeoutMs);

      this._pending.set(id, {
        resolve: (data) => { clearTimeout(timer); resolve(data); },
        reject: (err) => { clearTimeout(timer); reject(err); },
      });

      const msg = JSON.stringify({ _id: id, action, ...params }) + '\n';
      this._process.stdin.write(msg);
    });
  }

  async ping() {
    const r = await this._send('ping', {}, 5000);
    return r.message === 'pong';
  }

  async checkModel(modelId) {
    const r = await this._send('check_model', { model_id: modelId }, 30000);
    return r.cached;
  }

  async getModelSize(modelId) {
    const r = await this._send('get_model_size', { model_id: modelId }, 30000);
    return r.size_bytes || 0;
  }

  async downloadModel(modelId) {
    return this._send('download_model', { model_id: modelId }, 600000);
  }

  async loadModel(modelId) {
    const r = await this._send('load_model', { model_id: modelId }, 600000);
    this._loaded = true;
    return r;
  }

  async transcribe(audioPath, options = {}) {
    const params = {
      audio_path: audioPath,
      max_tokens: options.maxTokens || 128000,
      language: options.language || 'auto',
    };
    if (options.contextVocab && options.contextVocab.length > 0) {
      params.context_vocab = options.contextVocab;
    }
    const r = await this._send('transcribe', params, 120000);
    return r.text || '';
  }

  isLoaded() {
    return this._loaded;
  }

  stop() {
    if (this._process) {
      this._send('quit', {}, 3000).catch(() => {});
      setTimeout(() => {
        if (this._process) {
          this._process.kill();
          this._process = null;
        }
      }, 3000);
    }
  }
}

module.exports = TranscriberBridge;
