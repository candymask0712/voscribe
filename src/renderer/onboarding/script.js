/* ── Onboarding wizard ── */

const TOTAL_STEPS = 4;
let currentStep = 0;
let permPollTimer = null;
let capturingHotkey = false;
let chosenAccelerator = 'Alt+Space';
let chosenDisplayLabel = '⌥ Space';
let modelDownloaded = false;
let modelLoaded = false;

// DOM refs
const dotsContainer = document.getElementById('steps-dots');
const btnBack = document.getElementById('btn-back');
const btnNext = document.getElementById('btn-next');

// ── Step dots ─────────────────────────────────────────────────────────
function buildDots() {
  dotsContainer.innerHTML = '';
  for (let i = 0; i < TOTAL_STEPS; i++) {
    const d = document.createElement('span');
    d.className = 'dot' + (i < currentStep ? ' done' : '') + (i === currentStep ? ' active' : '');
    dotsContainer.appendChild(d);
  }
}

// ── Navigation ────────────────────────────────────────────────────────
function goTo(step) {
  currentStep = Math.max(0, Math.min(step, TOTAL_STEPS - 1));
  for (let i = 0; i < TOTAL_STEPS; i++) {
    document.getElementById(`step-${i}`).classList.toggle('hidden', i !== currentStep);
  }
  buildDots();

  btnBack.classList.toggle('hidden', currentStep === 0);

  if (currentStep === TOTAL_STEPS - 1) {
    btnNext.textContent = 'Done';
  } else if (currentStep === 0) {
    btnNext.textContent = 'Get Started';
  } else {
    btnNext.textContent = 'Next';
  }

  updateNextEnabled();
  onStepEnter(currentStep);
}

function updateNextEnabled() {
  if (currentStep === 1) {
    // Permissions step: both must be granted
    const axOk = document.getElementById('perm-ax').classList.contains('granted');
    const micOk = document.getElementById('perm-mic').classList.contains('granted');
    btnNext.disabled = !(axOk && micOk);
  } else if (currentStep === 3) {
    btnNext.disabled = !modelLoaded;
  } else {
    btnNext.disabled = false;
  }
}

btnNext.addEventListener('click', async () => {
  if (currentStep === TOTAL_STEPS - 1) {
    // Save hotkey and complete
    await window.api.prefs.set('hotkeyAccelerator', chosenAccelerator);
    await window.api.onboarding.complete();
    return;
  }
  goTo(currentStep + 1);
});

btnBack.addEventListener('click', () => goTo(currentStep - 1));

// ── Step enter hooks ──────────────────────────────────────────────────
function onStepEnter(step) {
  if (step === 1) startPermPolling();
  else stopPermPolling();

  if (step === 3) fetchModelInfo();
}

// ── Step 1: Permissions ───────────────────────────────────────────────
async function checkPerms() {
  const p = await window.api.perms.check();
  setPermStatus('perm-ax', p.accessibility);
  setPermStatus('perm-mic', p.microphone);
  document.getElementById('btn-ax').disabled = p.accessibility;
  document.getElementById('btn-mic').disabled = p.microphone;
  updateNextEnabled();
}

function setPermStatus(id, granted) {
  const el = document.getElementById(id);
  el.textContent = granted ? 'Granted' : 'Not granted';
  el.className = 'perm-status ' + (granted ? 'granted' : 'missing');
}

function startPermPolling() {
  checkPerms();
  permPollTimer = setInterval(checkPerms, 2000);
}

function stopPermPolling() {
  if (permPollTimer) { clearInterval(permPollTimer); permPollTimer = null; }
}

document.getElementById('btn-ax').addEventListener('click', () => {
  window.api.perms.requestAccessibility();
});

document.getElementById('btn-mic').addEventListener('click', () => {
  window.api.perms.requestMicrophone();
});

// ── Step 2: Hotkey ────────────────────────────────────────────────────
const hotkeyDisplay = document.getElementById('hotkey-display');
const hotkeyHint = document.getElementById('hotkey-hint');

document.getElementById('btn-change-hotkey').addEventListener('click', () => {
  capturingHotkey = true;
  hotkeyDisplay.textContent = 'Press shortcut...';
  hotkeyDisplay.classList.add('capturing');
  hotkeyHint.textContent = 'Press your preferred key combination now.';
});

document.addEventListener('keydown', (e) => {
  if (!capturingHotkey) return;
  e.preventDefault();
  e.stopPropagation();

  // Ignore bare modifier keys
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;

  const parts = [];
  const displayParts = [];
  if (e.ctrlKey)  { parts.push('Ctrl');  displayParts.push('⌃'); }
  if (e.altKey)   { parts.push('Alt');   displayParts.push('⌥'); }
  if (e.shiftKey) { parts.push('Shift'); displayParts.push('⇧'); }
  if (e.metaKey)  { parts.push('CommandOrControl'); displayParts.push('⌘'); }

  // Need at least one modifier
  if (parts.length === 0) {
    hotkeyHint.textContent = 'Please include at least one modifier key (⌘, ⌥, ⌃, or ⇧).';
    return;
  }

  const keyName = e.code.replace('Key', '').replace('Digit', '');
  const displayKey = e.key === ' ' ? 'Space' : keyName;
  parts.push(displayKey);
  displayParts.push(displayKey);

  chosenAccelerator = parts.join('+');
  chosenDisplayLabel = displayParts.join(' ');

  hotkeyDisplay.textContent = chosenDisplayLabel;
  hotkeyDisplay.classList.remove('capturing');
  hotkeyHint.textContent = `Shortcut set to ${chosenDisplayLabel}`;
  capturingHotkey = false;
});

// ── Step 3: Model download ────────────────────────────────────────────
const modelSizeEl = document.getElementById('model-size');
const progressContainer = document.getElementById('progress-container');
const progressFill = document.getElementById('progress-fill');
const progressLabel = document.getElementById('progress-label');
const btnDownload = document.getElementById('btn-download');

async function fetchModelInfo() {
  const modelId = 'mlx-community/Qwen3-ASR-1.7B-8bit';
  try {
    await window.api.transcriber.start();

    // Check if already cached
    const cached = await window.api.transcriber.checkModel(modelId);
    if (cached) {
      modelSizeEl.textContent = 'Already downloaded';
      btnDownload.textContent = 'Load Model';
      modelDownloaded = true;
      return;
    }

    // Get size
    const bytes = await window.api.transcriber.getModelSize(modelId);
    const gb = (bytes / (1024 ** 3)).toFixed(1);
    modelSizeEl.textContent = `~${gb} GB download`;
  } catch (err) {
    modelSizeEl.textContent = '~1.7 GB download';
  }
}

btnDownload.addEventListener('click', async () => {
  const modelId = 'mlx-community/Qwen3-ASR-1.7B-8bit';

  if (modelLoaded) return;

  if (!modelDownloaded) {
    // Download phase
    btnDownload.disabled = true;
    progressContainer.classList.remove('hidden');
    progressFill.classList.add('indeterminate');
    progressLabel.textContent = 'Downloading model... This may take a few minutes.';

    try {
      await window.api.transcriber.downloadModel(modelId);
      modelDownloaded = true;
      progressFill.classList.remove('indeterminate');
      progressFill.style.width = '100%';
      progressLabel.textContent = 'Download complete. Loading model...';
    } catch (err) {
      progressFill.classList.remove('indeterminate');
      progressFill.style.width = '0%';
      progressLabel.textContent = `Download failed: ${err.message}`;
      btnDownload.disabled = false;
      btnDownload.textContent = 'Retry';
      return;
    }
  }

  // Load phase
  btnDownload.disabled = true;
  progressContainer.classList.remove('hidden');
  progressFill.classList.remove('indeterminate');
  progressFill.style.width = '100%';
  progressLabel.textContent = 'Loading model and warming up...';

  try {
    await window.api.transcriber.loadModel(modelId);
    modelLoaded = true;
    progressLabel.textContent = 'Model ready!';
    btnDownload.textContent = 'Ready';
    updateNextEnabled();
  } catch (err) {
    progressLabel.textContent = `Load failed: ${err.message}`;
    btnDownload.disabled = false;
    btnDownload.textContent = 'Retry';
  }
});

// ── Init ──────────────────────────────────────────────────────────────
goTo(0);
