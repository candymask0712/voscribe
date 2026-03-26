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
loadDict();
