const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const PREFS_FILE = path.join(app.getPath('userData'), 'preferences.json');

const DEFAULTS = {
  hotkeyAccelerator: 'Alt+Space',
  modelId: 'mlx-community/Qwen3-ASR-1.7B-8bit',
  maxTokens: 128000,
  asrLanguage: 'auto',
  uiLanguage: 'auto',
  onboardingCompleted: false,
  launchAtLogin: false,
  micDeviceId: null,
  soundEnabled: true,
  learningMode: false,
};

let _prefs = null;

function load() {
  try {
    const data = fs.readFileSync(PREFS_FILE, 'utf-8');
    _prefs = { ...DEFAULTS, ...JSON.parse(data) };
  } catch {
    _prefs = { ...DEFAULTS };
  }
}

function save() {
  try {
    fs.mkdirSync(path.dirname(PREFS_FILE), { recursive: true });
    fs.writeFileSync(PREFS_FILE, JSON.stringify(_prefs, null, 2));
  } catch (err) {
    console.error('Failed to save preferences:', err.message);
  }
}

function get(key) {
  if (!_prefs) load();
  if (key === undefined) return { ..._prefs };
  return key in _prefs ? _prefs[key] : DEFAULTS[key];
}

function set(key, value) {
  if (!_prefs) load();
  _prefs[key] = value;
  save();
}

function getAll() {
  if (!_prefs) load();
  return { ..._prefs };
}

module.exports = { get, set, getAll, load, save, DEFAULTS };
