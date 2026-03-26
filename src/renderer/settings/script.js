/* ── Settings renderer ── */

const hotkeyBadge = document.getElementById('hotkey-badge');
const btnChange = document.getElementById('btn-change');
const shortcutHint = document.getElementById('shortcut-hint');
const selLang = document.getElementById('sel-lang');
const selMic = document.getElementById('sel-mic');
const chkLearning = document.getElementById('chk-learning');

let capturing = false;

// ── Load current preferences ──────────────────────────────────────────
async function loadPrefs() {
  const prefs = await window.api.prefs.getAll();

  // Hotkey
  hotkeyBadge.textContent = acceleratorToDisplay(prefs.hotkeyAccelerator || 'Alt+Space');

  // Learning mode
  chkLearning.checked = prefs.learningMode || false;

  // ASR language
  selLang.value = prefs.asrLanguage || 'auto';

  // Microphone
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputs = devices.filter((d) => d.kind === 'audioinput');
    selMic.innerHTML = '<option value="">System Default</option>';
    for (const dev of inputs) {
      const opt = document.createElement('option');
      opt.value = dev.deviceId;
      opt.textContent = dev.label || `Microphone ${dev.deviceId.slice(0, 8)}`;
      selMic.appendChild(opt);
    }
    if (prefs.micDeviceId) selMic.value = prefs.micDeviceId;
  } catch {}
}

// ── Shortcut change ───────────────────────────────────────────────────
btnChange.addEventListener('click', () => {
  capturing = true;
  hotkeyBadge.textContent = '...';
  hotkeyBadge.classList.add('capturing');
  shortcutHint.textContent = 'Press your new shortcut...';
});

document.addEventListener('keydown', (e) => {
  if (!capturing) return;
  e.preventDefault();
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;

  const parts = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('CommandOrControl');

  if (parts.length === 0) {
    shortcutHint.textContent = 'Include at least one modifier key.';
    return;
  }

  const keyName = e.code.replace('Key', '').replace('Digit', '');
  const key = e.key === ' ' ? 'Space' : keyName;
  parts.push(key);

  const accelerator = parts.join('+');
  window.api.prefs.set('hotkeyAccelerator', accelerator);

  hotkeyBadge.textContent = acceleratorToDisplay(accelerator);
  hotkeyBadge.classList.remove('capturing');
  shortcutHint.textContent = 'Shortcut saved.';
  capturing = false;
});

// ── Learning mode ─────────────────────────────────────────────────────
chkLearning.addEventListener('change', () => {
  window.api.prefs.set('learningMode', chkLearning.checked);
});

// ── Language ──────────────────────────────────────────────────────────
selLang.addEventListener('change', () => {
  window.api.prefs.set('asrLanguage', selLang.value);
});

// ── Microphone ────────────────────────────────────────────────────────
selMic.addEventListener('change', () => {
  window.api.prefs.set('micDeviceId', selMic.value || null);
});

// ── AI Mode ───────────────────────────────────────────────────────────
const selMode = document.getElementById('sel-mode');
const aiEndpoint = document.getElementById('ai-endpoint');
const aiModel = document.getElementById('ai-model');
const aiKey = document.getElementById('ai-key');

async function loadAIModes() {
  const modes = await window.api.aiModes.list();
  const prefs = await window.api.prefs.getAll();
  selMode.innerHTML = '';
  for (const m of modes) {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = `${m.name} (${m.nameKo})`;
    selMode.appendChild(opt);
  }
  selMode.value = prefs.aiMode || 'raw';
  aiEndpoint.value = prefs.aiEndpoint || '';
  aiModel.value = prefs.aiModel || '';
  aiKey.value = prefs.aiApiKey || '';
}

selMode.addEventListener('change', () => {
  window.api.prefs.set('aiMode', selMode.value);
});
aiEndpoint.addEventListener('change', () => {
  window.api.prefs.set('aiEndpoint', aiEndpoint.value.trim());
});
aiModel.addEventListener('change', () => {
  window.api.prefs.set('aiModel', aiModel.value.trim());
});
aiKey.addEventListener('change', () => {
  window.api.prefs.set('aiApiKey', aiKey.value.trim());
});

// ── Per-App Modes ─────────────────────────────────────────────────────
const appModeList = document.getElementById('app-mode-list');
const appNameInput = document.getElementById('app-name');
const appModeSel = document.getElementById('app-mode-sel');

async function loadAppModes() {
  const modes = await window.api.aiModes.list();
  const prefs = await window.api.prefs.getAll();
  const appModes = prefs.appModes || {};

  // Populate mode selector
  appModeSel.innerHTML = '';
  for (const m of modes) {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = `${m.name} (${m.nameKo})`;
    appModeSel.appendChild(opt);
  }

  // Render list
  appModeList.innerHTML = '';
  for (const [app, mode] of Object.entries(appModes)) {
    const modeInfo = modes.find((m) => m.id === mode);
    const el = document.createElement('div');
    el.className = 'dict-entry';
    el.innerHTML = `
      <span class="dict-from">${escHtml(app)}</span>
      <span class="dict-arrow-sm">→</span>
      <span class="dict-to">${modeInfo ? modeInfo.name : mode}</span>
      <button class="dict-del" data-key="${escAttr(app)}">✕</button>
    `;
    appModeList.appendChild(el);
  }
  appModeList.querySelectorAll('.dict-del').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const cur = (await window.api.prefs.getAll()).appModes || {};
      delete cur[btn.dataset.key];
      await window.api.prefs.set('appModes', cur);
      loadAppModes();
    });
  });
}

document.getElementById('btn-app-add').addEventListener('click', async () => {
  const app = appNameInput.value.trim();
  const mode = appModeSel.value;
  if (!app) return;
  const cur = (await window.api.prefs.getAll()).appModes || {};
  cur[app] = mode;
  await window.api.prefs.set('appModes', cur);
  appNameInput.value = '';
  loadAppModes();
});

// ── Correction Dictionary ─────────────────────────────────────────────
const dictList = document.getElementById('dict-list');
const dictFrom = document.getElementById('dict-from');
const dictTo = document.getElementById('dict-to');

async function loadDict() {
  const dict = await window.api.corrections.getDict();
  dictList.innerHTML = '';
  for (const [from, to] of Object.entries(dict)) {
    const el = document.createElement('div');
    el.className = 'dict-entry';
    el.innerHTML = `
      <span class="dict-from">${escHtml(from)}</span>
      <span class="dict-arrow-sm">→</span>
      <span class="dict-to">${escHtml(to)}</span>
      <button class="dict-del" data-key="${escAttr(from)}">✕</button>
    `;
    dictList.appendChild(el);
  }
  // Attach delete handlers
  dictList.querySelectorAll('.dict-del').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await window.api.corrections.removeFromDict(btn.dataset.key);
      loadDict();
    });
  });
}

document.getElementById('btn-dict-add').addEventListener('click', async () => {
  const from = dictFrom.value.trim();
  const to = dictTo.value.trim();
  if (!from || !to || from === to) return;
  await window.api.corrections.addToDict(from, to);
  dictFrom.value = '';
  dictTo.value = '';
  loadDict();
});

function escHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escAttr(s) { return s.replace(/"/g,'&quot;'); }

// ── Snippets ──────────────────────────────────────────────────────────
const snippetList = document.getElementById('snippet-list');
const snipTrigger = document.getElementById('snip-trigger');
const snipExpansion = document.getElementById('snip-expansion');

async function loadSnippets() {
  const all = await window.api.snippets.getAll();
  snippetList.innerHTML = '';
  if (Object.keys(all).length === 0) {
    snippetList.innerHTML = '';
  }
  for (const [trigger, expansion] of Object.entries(all)) {
    const el = document.createElement('div');
    el.className = 'dict-entry';
    const preview = expansion.length > 30 ? expansion.slice(0, 30) + '...' : expansion;
    el.innerHTML = `
      <span class="dict-from">${escHtml(trigger)}</span>
      <span class="dict-arrow-sm">→</span>
      <span class="dict-to">${escHtml(preview)}</span>
      <button class="dict-del" data-key="${escAttr(trigger)}">✕</button>
    `;
    snippetList.appendChild(el);
  }
  snippetList.querySelectorAll('.dict-del').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await window.api.snippets.remove(btn.dataset.key);
      loadSnippets();
    });
  });
}

document.getElementById('btn-snip-add').addEventListener('click', async () => {
  const trigger = snipTrigger.value.trim();
  const expansion = snipExpansion.value.trim();
  if (!trigger || !expansion) return;
  await window.api.snippets.add(trigger, expansion);
  snipTrigger.value = '';
  snipExpansion.value = '';
  loadSnippets();
});

// ── Helpers ───────────────────────────────────────────────────────────
function acceleratorToDisplay(accel) {
  return accel
    .replace('CommandOrControl', '⌘')
    .replace('Ctrl', '⌃')
    .replace('Alt', '⌥')
    .replace('Shift', '⇧')
    .replace(/\+/g, ' ');
}

// ── Init ──────────────────────────────────────────────────────────────
loadPrefs();
loadAIModes();
loadAppModes();
loadDict();
loadSnippets();
