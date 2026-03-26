/* ── Overlay renderer — audio capture + recording UI ── */

const overlayEl = document.getElementById('overlay');
const recordingView = document.getElementById('recording-view');
const transcribingView = document.getElementById('transcribing-view');
const errorView = document.getElementById('error-view');
const errorMsg = document.getElementById('error-msg');
const timerEl = document.getElementById('timer');
const bars = document.querySelectorAll('#level-bars .bar');

let audioContext = null;
let mediaStream = null;
let sourceNode = null;
let processorNode = null;
let analyserNode = null;
let chunks = [];
let timerInterval = null;
let levelInterval = null;
let startTime = 0;
let levels = new Float32Array(8).fill(0);
let levelIndex = 0;

// ── State management ──────────────────────────────────────────────────
function showView(name) {
  overlayEl.classList.remove('hidden');
  recordingView.classList.toggle('hidden', name !== 'recording');
  transcribingView.classList.toggle('hidden', name !== 'transcribing');
  errorView.classList.toggle('hidden', name !== 'error');
}

window.api.onOverlayState((state, data) => {
  if (state === 'recording') {
    showView('recording');
  } else if (state === 'transcribing') {
    showView('transcribing');
  } else if (state === 'error') {
    errorMsg.textContent = data || 'Error';
    showView('error');
  } else if (state === 'idle') {
    overlayEl.classList.add('hidden');
    resetTimer();
  }
});

// ── Audio capture ─────────────────────────────────────────────────────
window.api.onAudioCapture(async (action, deviceId) => {
  if (action === 'start') {
    await startCapture(deviceId);
  } else if (action === 'stop') {
    await stopCapture();
  }
});

async function startCapture(deviceId) {
  chunks = [];
  levels.fill(0);
  levelIndex = 0;

  try {
    const constraints = { audio: deviceId ? { deviceId: { exact: deviceId } } : true };
    mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

    audioContext = new AudioContext();
    sourceNode = audioContext.createMediaStreamSource(mediaStream);

    // Analyser for level visualization
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 512;
    sourceNode.connect(analyserNode);

    // ScriptProcessor to capture raw PCM
    const bufferSize = 4096;
    processorNode = audioContext.createScriptProcessor(bufferSize, 1, 1);
    processorNode.onaudioprocess = (e) => {
      const data = e.inputBuffer.getChannelData(0);
      chunks.push(new Float32Array(data));
    };
    sourceNode.connect(processorNode);
    processorNode.connect(audioContext.destination);

    // Start UI updates
    startTimer();
    startLevelMeter();
  } catch (err) {
    console.error('Audio capture failed:', err);
  }
}

async function stopCapture() {
  stopTimer();
  stopLevelMeter();

  if (!audioContext || chunks.length === 0) return;

  // Disconnect nodes
  try { sourceNode.disconnect(); } catch {}
  try { processorNode.disconnect(); } catch {}

  // Stop mic stream
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }

  // Merge PCM chunks
  const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
  if (totalLength === 0) return;

  const pcm = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    pcm.set(chunk, offset);
    offset += chunk.length;
  }
  chunks = [];

  // Resample to 16 kHz
  const nativeSR = audioContext.sampleRate;
  let samples = pcm;

  if (nativeSR !== 16000) {
    const newLen = Math.ceil(pcm.length * 16000 / nativeSR);
    const offline = new OfflineAudioContext(1, newLen, 16000);
    const buf = offline.createBuffer(1, pcm.length, nativeSR);
    buf.getChannelData(0).set(pcm);
    const src = offline.createBufferSource();
    src.buffer = buf;
    src.connect(offline.destination);
    src.start();
    const rendered = await offline.startRendering();
    samples = rendered.getChannelData(0);
  }

  await audioContext.close();
  audioContext = null;

  // Encode WAV (16-bit PCM, mono, 16 kHz)
  const wav = encodeWAV(samples, 16000);
  window.api.sendAudioData(wav);
}

// ── WAV encoder ───────────────────────────────────────────────────────
function encodeWAV(samples, sampleRate) {
  const numSamples = samples.length;
  const dataSize = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeStr(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(view, 8, 'WAVE');
  writeStr(view, 12, 'fmt ');
  view.setUint32(16, 16, true);       // fmt chunk size
  view.setUint16(20, 1, true);        // PCM
  view.setUint16(22, 1, true);        // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true);        // block align
  view.setUint16(34, 16, true);       // bits per sample
  writeStr(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Float32 → Int16
  let off = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    off += 2;
  }

  return buffer;
}

function writeStr(view, offset, str) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

// ── Timer ─────────────────────────────────────────────────────────────
function startTimer() {
  startTime = Date.now();
  timerEl.textContent = '0:00';
  timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const m = Math.floor(elapsed / 60);
    const s = elapsed % 60;
    timerEl.textContent = `${m}:${String(s).padStart(2, '0')}`;
  }, 250);
}

function stopTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}

function resetTimer() {
  stopTimer();
  timerEl.textContent = '0:00';
}

// ── Level meter ───────────────────────────────────────────────────────
function startLevelMeter() {
  levelInterval = setInterval(() => {
    if (!analyserNode) return;
    const dataArray = new Uint8Array(analyserNode.frequencyBinCount);
    analyserNode.getByteTimeDomainData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const v = (dataArray[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / dataArray.length);
    const level = Math.min(rms * 40, 1.0);

    levels[levelIndex] = level;
    levelIndex = (levelIndex + 1) % 8;

    for (let i = 0; i < 8; i++) {
      const idx = (levelIndex + i) % 8;
      const h = Math.max(3, levels[idx] * 20);
      bars[i].style.height = `${h}px`;
    }
  }, 80);
}

function stopLevelMeter() {
  if (levelInterval) { clearInterval(levelInterval); levelInterval = null; }
  bars.forEach((b) => { b.style.height = '3px'; });
}
