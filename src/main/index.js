const { app, ipcMain, session } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const preferences = require('./preferences');
const permissions = require('./permissions');
const clipboard = require('./clipboard-paste');
const TranscriberBridge = require('./transcriber');
const ShortcutManager = require('./shortcut');
const TrayManager = require('./tray');
const OverlayManager = require('./overlay');
const OnboardingWindow = require('./onboarding-window');
const SettingsWindow = require('./settings-window');
const EditWindow = require('./edit-window');
const correctionStore = require('./correction-store');
const sounds = require('./sounds');
const { postProcess } = require('./post-process');
const aiModes = require('./ai-modes');
const snippets = require('./snippets');
const i18n = require('../locales');

// ── Single instance ───────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }

// ── State ─────────────────────────────────────────────────────────────
let tray, shortcuts, overlay, transcriber, onboardingWin, settingsWin, editWin;
let isRecording = false;
let permissionPollTimer = null;
let lastTranscription = null;
let selectedTextContext = null;

// ── App lifecycle ─────────────────────────────────────────────────────
app.whenReady().then(() => {
  if (app.dock) app.dock.hide();

  // DIAGNOSTIC: Track every BrowserWindow creation and show
  const { BrowserWindow } = require('electron');
  app.on('browser-window-created', (_e, win) => {
    const url = win.webContents.getURL() || 'loading...';
    console.log('[WINDOW-TRACE] CREATED:', win.id, win.getTitle(), url);
    win.webContents.on('did-finish-load', () => {
      console.log('[WINDOW-TRACE] LOADED:', win.id, win.getTitle(), win.webContents.getURL());
    });
    win.on('show', () => {
      console.log('[WINDOW-TRACE] SHOWN:', win.id, win.getTitle(), win.webContents.getURL());
    });
    win.on('focus', () => {
      console.log('[WINDOW-TRACE] FOCUSED:', win.id, win.getTitle(), win.webContents.getURL());
    });
  });

  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => {
    cb(perm === 'media' || perm === 'microphone');
  });
  session.defaultSession.setPermissionCheckHandler(() => true);

  const uiLang = preferences.get('uiLanguage') || 'auto';
  const sysLang = app.getLocale().startsWith('ko') ? 'ko' : 'en';
  i18n.load(uiLang === 'auto' ? sysLang : uiLang);

  transcriber = new TranscriberBridge();
  overlay = new OverlayManager();
  shortcuts = new ShortcutManager();
  settingsWin = new SettingsWindow();
  editWin = new EditWindow();

  tray = new TrayManager({
    onSettingsClick: () => settingsWin.show(),
    onHistoryClick: async (text) => {
      await clipboard.saveTargetApp();
      await clipboard.pasteText(text);
    },
  });

  registerIPC();

  if (!preferences.get('onboardingCompleted')) {
    showOnboarding();
  } else {
    bootApp();
  }
});

app.on('window-all-closed', () => {});
app.on('will-quit', () => {
  if (shortcuts) shortcuts.unregisterAll();
  if (transcriber) transcriber.stop();
  if (permissionPollTimer) clearInterval(permissionPollTimer);
});
app.on('second-instance', () => { if (settingsWin) settingsWin.show(); });

// ── Onboarding ────────────────────────────────────────────────────────
function showOnboarding() {
  onboardingWin = new OnboardingWindow();
  onboardingWin.show(() => {
    if (preferences.get('onboardingCompleted')) bootApp();
  });
}

// ── Boot ──────────────────────────────────────────────────────────────
async function bootApp() {
  const perms = await permissions.checkAll();
  if (!perms.accessibility || !perms.microphone) {
    tray.setStatus('waiting_permissions');
    permissionPollTimer = setInterval(async () => {
      const p = await permissions.checkAll();
      if (p.accessibility && p.microphone) {
        clearInterval(permissionPollTimer);
        permissionPollTimer = null;
        loadModel();
      }
    }, 2000);
    return;
  }
  loadModel();
}

async function loadModel() {
  tray.setStatus('loading_model');
  try {
    transcriber.start();
    await transcriber.loadModel(preferences.get('modelId'));
    tray.setStatus('ready');
    registerHotkeys();
  } catch (err) {
    console.error('Model load failed:', err.message);
    tray.setStatus('error');
  }
}

// ── Hotkeys ───────────────────────────────────────────────────────────
function registerHotkeys() {
  shortcuts.unregisterAll();
  const accel = preferences.get('hotkeyAccelerator') || 'Alt+Space';
  shortcuts.register(accel, () => toggleRecording());
  shortcuts.register('Alt+Shift+E', () => openEditPopup());
  shortcuts.register('Alt+Shift+Z', () => undoLastPaste());
}

// ── Recording ─────────────────────────────────────────────────────────
async function toggleRecording() {
  isRecording ? stopRecording() : startRecording();
}

async function startRecording() {
  if (isRecording) return;
  isRecording = true;

  await clipboard.saveTargetApp();
  selectedTextContext = await clipboard.getSelectedText();

  sounds.playStart();
  tray.setStatus('recording');
  await overlay.showRecording();
  overlay.startAudioCapture(preferences.get('micDeviceId'));
  shortcuts.register('Escape', () => cancelRecording());
}

function stopRecording() {
  if (!isRecording) return;
  isRecording = false;

  sounds.playStop();
  shortcuts.unregister('Escape');
  tray.setStatus('transcribing');

  // Always hide overlay immediately — edit popup or direct paste follows
  overlay.stopAudioCapture();
  overlay.hide();
}

function cancelRecording() {
  if (!isRecording) return;
  isRecording = false;
  shortcuts.unregister('Escape');
  overlay.stopAudioCapture();
  overlay.hide();
  tray.setStatus('ready');
}

// ── Undo ──────────────────────────────────────────────────────────────
async function undoLastPaste() {
  if (!lastTranscription || isRecording) return;
  try {
    const { execFile } = require('child_process');
    const len = lastTranscription.text.length;
    await new Promise((resolve, reject) => {
      execFile('osascript', ['-e', `
        tell application "System Events"
          repeat ${len} times
            key code 51
          end repeat
        end tell
      `], (err) => err ? reject(err) : resolve());
    });
    lastTranscription = null;
    sounds.play('Frog');
  } catch (err) {
    console.error('Undo failed:', err.message);
  }
}

// ── Edit popup ────────────────────────────────────────────────────────
function openEditPopup() {
  if (!lastTranscription || isRecording) return;
  editWin.show(lastTranscription.text);
}

// ── Transcription pipeline ────────────────────────────────────────────
async function processAudioData(wavArrayBuffer) {
  const bufSize = wavArrayBuffer
    ? (wavArrayBuffer.byteLength || Buffer.byteLength(wavArrayBuffer))
    : 0;

  if (bufSize < 10000) {
    overlay.hide();
    tray.setStatus('ready');
    return;
  }

  const tmpPath = path.join(os.tmpdir(), `voscribe_${Date.now()}.wav`);
  try {
    fs.writeFileSync(tmpPath, Buffer.from(wavArrayBuffer));

    // 1. ASR transcription
    const rawText = await transcriber.transcribe(tmpPath, {
      maxTokens: preferences.get('maxTokens'),
      language: preferences.get('asrLanguage') || 'auto',
      contextVocab: correctionStore.getContextVocabulary(),
    });

    // 2. Post-processing pipeline: filler removal → corrections → snippets → AI mode
    const cleaned = rawText ? postProcess(rawText.trim()) : '';
    let text = cleaned ? correctionStore.applyCorrections(cleaned) : '';

    const snippetMatch = text ? snippets.matchSnippet(text) : null;
    if (snippetMatch) text = snippetMatch;

    const appModes = preferences.get('appModes') || {};
    const targetApp = clipboard.getTargetAppName();
    const modeId = (targetApp && appModes[targetApp]) || preferences.get('aiMode') || 'raw';

    if (text && modeId !== 'raw' && !snippetMatch) {
      text = await aiModes.applyMode(modeId, text, {
        endpoint: preferences.get('aiEndpoint'),
        model: preferences.get('aiModel'),
        apiKey: preferences.get('aiApiKey'),
      }, selectedTextContext);
    }

    // 3. Output
    overlay.destroy();

    if (text) {
      lastTranscription = { text, timestamp: Date.now() };
      tray.addHistory(text);

      if (preferences.get('learningMode')) {
        // Learning mode: show edit popup for review
        shortcuts.unregisterAll();
        editWin.show(text);
      } else {
        // Default mode: hide app to return focus to target, then paste
        app.hide();
        await new Promise((r) => setTimeout(r, 300));
        await clipboard.pasteText(text);
      }
    }
    tray.setStatus('ready');
  } catch (err) {
    console.error('Transcription error:', err.message);
    overlay.showError('Transcription failed');
    setTimeout(() => { overlay.hide(); tray.setStatus('ready'); }, 3000);
  } finally {
    try { fs.unlinkSync(tmpPath); } catch {}
  }
}

// ── IPC handlers ──────────────────────────────────────────────────────
function registerIPC() {
  // Audio data from overlay renderer
  ipcMain.on('audio-data', (_e, buf) => processAudioData(buf));

  // Edit popup result
  ipcMain.on('edit:result', async (_e, result) => {
    // Close all windows and hide the app — macOS returns focus to previous app
    editWin.destroy();
    overlay.destroy();
    app.hide();

    // Wait for OS to return focus to the target app
    await new Promise((r) => setTimeout(r, 400));

    if (!result || !lastTranscription) {
      if (lastTranscription) await clipboard.pasteText(lastTranscription.text);
      tray.setStatus('ready');
      registerHotkeys();
      return;
    }

    if (result.changed) {
      correctionStore.recordCorrection(result.original, result.corrected);
    }

    try {
      await clipboard.pasteText(result.corrected);
      lastTranscription.text = result.corrected;
    } catch (err) {
      console.error('Paste failed:', err.message);
    }
    tray.setStatus('ready');
    registerHotkeys();
  });

  // Preferences
  ipcMain.handle('prefs:get', (_e, key) => preferences.get(key));
  ipcMain.handle('prefs:set', (_e, key, value) => {
    preferences.set(key, value);
    if (key === 'hotkeyAccelerator' && transcriber && transcriber.isLoaded()) {
      registerHotkeys();
    }
  });
  ipcMain.handle('prefs:getAll', () => preferences.getAll());

  // i18n & AI modes & Snippets
  ipcMain.handle('i18n:getStrings', () => i18n.getAllStrings());
  ipcMain.handle('aiModes:list', () => aiModes.getModeList());
  ipcMain.handle('snippets:getAll', () => snippets.getAll());
  ipcMain.handle('snippets:add', (_e, t, exp) => snippets.add(t, exp));
  ipcMain.handle('snippets:remove', (_e, t) => snippets.remove(t));

  // Corrections
  ipcMain.handle('corrections:getDict', () => correctionStore.getDictionary());
  ipcMain.handle('corrections:getLog', () => correctionStore.getLog());
  ipcMain.handle('corrections:addToDict', (_e, w, c) => correctionStore.addToDictionary(w, c));
  ipcMain.handle('corrections:removeFromDict', (_e, w) => correctionStore.removeFromDictionary(w));

  // Permissions
  ipcMain.handle('perms:check', () => permissions.checkAll());
  ipcMain.handle('perms:requestAccessibility', () => permissions.requestAccessibility());
  ipcMain.handle('perms:requestMicrophone', () => permissions.requestMicrophone());

  // Transcriber (onboarding)
  ipcMain.handle('transcriber:start', () => { transcriber.start(); return true; });
  ipcMain.handle('transcriber:checkModel', (_e, id) => transcriber.checkModel(id));
  ipcMain.handle('transcriber:getModelSize', (_e, id) => transcriber.getModelSize(id));
  ipcMain.handle('transcriber:downloadModel', (_e, id) => transcriber.downloadModel(id));
  ipcMain.handle('transcriber:loadModel', async (_e, id) => { await transcriber.loadModel(id); return true; });
  ipcMain.handle('transcriber:isLoaded', () => transcriber.isLoaded());

  // Onboarding complete
  ipcMain.handle('onboarding:complete', () => {
    preferences.set('onboardingCompleted', true);
    if (onboardingWin) onboardingWin.close();
    bootApp();
  });
}
