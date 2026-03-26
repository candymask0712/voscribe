const { app, ipcMain, session } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const preferences = require('./preferences');
const permissions = require('./permissions');
const { pasteText, replaceLastText, saveTargetApp, activateTargetApp } = require('./clipboard-paste');
const TranscriberBridge = require('./transcriber');
const ShortcutManager = require('./shortcut');
const TrayManager = require('./tray');
const OverlayManager = require('./overlay');
const OnboardingWindow = require('./onboarding-window');
const SettingsWindow = require('./settings-window');
const EditWindow = require('./edit-window');
const correctionStore = require('./correction-store');

// ── Single instance lock ──────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }

// ── App-wide state ────────────────────────────────────────────────────
let tray, shortcuts, overlay, transcriber, onboardingWin, settingsWin, editWin;
let isRecording = false;
let permissionPollTimer = null;
let lastTranscription = null; // {text, timestamp} — for edit popup

// ── App lifecycle ─────────────────────────────────────────────────────
app.whenReady().then(() => {
  // Menu-bar-only app — hide dock icon
  if (app.dock) app.dock.hide();

  // Auto-approve microphone permission requests inside renderers
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => {
    cb(perm === 'media' || perm === 'microphone');
  });
  session.defaultSession.setPermissionCheckHandler(() => true);

  // Initialize managers
  transcriber = new TranscriberBridge();
  overlay = new OverlayManager();
  shortcuts = new ShortcutManager();
  settingsWin = new SettingsWindow();
  editWin = new EditWindow();

  tray = new TrayManager({
    onSettingsClick: () => settingsWin.show(),
  });

  // Register IPC handlers
  registerIPC();

  // Decide entry flow
  if (!preferences.get('onboardingCompleted')) {
    showOnboarding();
  } else {
    bootApp();
  }
});

app.on('window-all-closed', () => { /* menu-bar app — stay alive */ });

app.on('will-quit', () => {
  if (shortcuts) shortcuts.unregisterAll();
  if (transcriber) transcriber.stop();
  if (permissionPollTimer) clearInterval(permissionPollTimer);
});

app.on('second-instance', () => {
  // If user launches again, just show settings
  if (settingsWin) settingsWin.show();
});

// ── Onboarding ────────────────────────────────────────────────────────
function showOnboarding() {
  onboardingWin = new OnboardingWindow();
  onboardingWin.show(() => {
    // Called when onboarding window closes
    if (preferences.get('onboardingCompleted')) {
      bootApp();
    }
  });
}

// ── Boot (post-onboarding) ────────────────────────────────────────────
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
    const modelId = preferences.get('modelId');
    await transcriber.loadModel(modelId);
    tray.setStatus('ready');
    registerHotkey();
  } catch (err) {
    console.error('Model load failed:', err.message);
    tray.setStatus('error');
  }
}

// ── Hotkey ─────────────────────────────────────────────────────────────
function registerHotkey() {
  shortcuts.unregisterAll();
  const accel = preferences.get('hotkeyAccelerator') || 'Alt+Space';
  shortcuts.register(accel, () => toggleRecording());
  // Edit last transcription shortcut
  shortcuts.register('Alt+Shift+E', () => openEditPopup());
}

// ── Recording flow ────────────────────────────────────────────────────
async function toggleRecording() {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
}

async function startRecording() {
  if (isRecording) return;
  isRecording = true;

  // Remember which app the user is working in BEFORE showing anything
  await saveTargetApp();

  tray.setStatus('recording');
  await overlay.showRecording();
  overlay.startAudioCapture(preferences.get('micDeviceId'));

  // Register Escape to cancel while recording
  shortcuts.register('Escape', () => cancelRecording());
}

function stopRecording() {
  if (!isRecording) return;
  isRecording = false;

  shortcuts.unregister('Escape');
  tray.setStatus('transcribing');

  if (preferences.get('learningMode')) {
    // Learning mode: hide overlay immediately — edit popup will appear later
    overlay.stopAudioCapture();
    overlay.hide();
  } else {
    // Default mode: show "Transcribing..." in overlay while processing
    overlay.showTranscribing();
    overlay.stopAudioCapture();
  }
}

function cancelRecording() {
  if (!isRecording) return;
  isRecording = false;

  shortcuts.unregister('Escape');
  overlay.stopAudioCapture();
  overlay.hide();
  tray.setStatus('ready');
}

// ── Edit popup ────────────────────────────────────────────────────────
function openEditPopup() {
  if (!lastTranscription) return;
  if (isRecording) return;
  editWin.show(lastTranscription.text);
}

// ── IPC handlers ──────────────────────────────────────────────────────
function registerIPC() {
  // Audio data from overlay renderer after recording stops
  ipcMain.on('audio-data', async (_event, wavArrayBuffer) => {
    const bufSize = wavArrayBuffer ? (wavArrayBuffer.byteLength || Buffer.byteLength(wavArrayBuffer)) : 0;
    console.log('[DEBUG] audio-data received, size:', bufSize);

    // Skip if audio is too short (< 0.3s at 16kHz 16-bit mono = ~9644 bytes + 44 header)
    if (bufSize < 10000) {
      console.log('[DEBUG] Audio too short, skipping transcription');
      overlay.hide();
      tray.setStatus('ready');
      return;
    }

    const tmpPath = path.join(os.tmpdir(), `voscribe_${Date.now()}.wav`);
    try {
      fs.writeFileSync(tmpPath, Buffer.from(wavArrayBuffer));
      const stat = fs.statSync(tmpPath);
      console.log('[DEBUG] WAV file written:', tmpPath, 'size:', stat.size);

      const lang = preferences.get('asrLanguage') || 'auto';
      const vocab = correctionStore.getContextVocabulary();
      console.log('[DEBUG] Transcribing with lang:', lang, 'vocab:', vocab.length, 'items');
      const rawText = await transcriber.transcribe(tmpPath, {
        maxTokens: preferences.get('maxTokens'),
        language: lang,
        contextVocab: vocab,
      });
      console.log('[DEBUG] Transcription result:', JSON.stringify(rawText));

      // Apply post-processing correction dictionary
      const text = rawText ? correctionStore.applyCorrections(rawText.trim()) : '';
      console.log('[DEBUG] After corrections:', JSON.stringify(text));

      overlay.hide();

      if (text) {
        lastTranscription = { text, timestamp: Date.now() };
        const isLearning = preferences.get('learningMode');
        console.log('[DEBUG] learningMode:', isLearning);

        if (isLearning) {
          // Learning mode: show only the edit popup (no overlay)
          console.log('[DEBUG] Opening edit popup');
          editWin.show(text);
        } else {
          // Default mode: paste directly
          console.log('[DEBUG] Pasting text...');
          await pasteText(text);
          console.log('[DEBUG] Paste complete');
        }
      } else {
        console.log('[DEBUG] Empty transcription, skipping');
      }
      tray.setStatus('ready');
    } catch (err) {
      console.error('[DEBUG] Transcription error:', err.message, err.stack);
      overlay.showError('Transcription failed');
      setTimeout(() => {
        overlay.hide();
        tray.setStatus('ready');
      }, 3000);
    } finally {
      try { fs.unlinkSync(tmpPath); } catch {}
    }
  });

  // Preferences get/set
  ipcMain.handle('prefs:get', (_event, key) => preferences.get(key));
  ipcMain.handle('prefs:set', (_event, key, value) => {
    console.log('[DEBUG] prefs:set', key, '=', value);
    preferences.set(key, value);
    // If hotkey changed, re-register
    if (key === 'hotkeyAccelerator' && transcriber && transcriber.isLoaded()) {
      registerHotkey();
    }
  });
  ipcMain.handle('prefs:getAll', () => preferences.getAll());

  // Permissions
  ipcMain.handle('perms:check', () => permissions.checkAll());
  ipcMain.handle('perms:requestAccessibility', () => {
    permissions.requestAccessibility();
  });
  ipcMain.handle('perms:requestMicrophone', () => permissions.requestMicrophone());

  // Transcriber commands (used by onboarding)
  ipcMain.handle('transcriber:start', () => {
    transcriber.start();
    return true;
  });
  ipcMain.handle('transcriber:checkModel', (_e, modelId) =>
    transcriber.checkModel(modelId)
  );
  ipcMain.handle('transcriber:getModelSize', (_e, modelId) =>
    transcriber.getModelSize(modelId)
  );
  ipcMain.handle('transcriber:downloadModel', (_e, modelId) =>
    transcriber.downloadModel(modelId)
  );
  ipcMain.handle('transcriber:loadModel', async (_e, modelId) => {
    await transcriber.loadModel(modelId);
    return true;
  });
  ipcMain.handle('transcriber:isLoaded', () => transcriber.isLoaded());

  // Close onboarding and boot app
  ipcMain.handle('onboarding:complete', () => {
    preferences.set('onboardingCompleted', true);
    if (onboardingWin) onboardingWin.close();
    bootApp();
  });

  // Audio devices enumeration (from renderer)
  ipcMain.handle('audio:devices', async () => {
    // Renderer will enumerate via navigator.mediaDevices
    return true;
  });

  // ── Edit popup result ───────────────────────────────────────────────
  ipcMain.on('edit:result', async (_event, result) => {
    editWin.hide();

    // Edit window had focus — restore focus to target app before pasting
    await activateTargetApp();

    if (!result || !lastTranscription) {
      // Cancelled — still paste the original
      if (lastTranscription) {
        await pasteText(lastTranscription.text);
      }
      tray.setStatus('ready');
      return;
    }

    const textToPaste = result.corrected;

    // Record correction if text was modified
    if (result.changed) {
      correctionStore.recordCorrection(result.original, result.corrected);
      console.log('[DEBUG] Correction recorded:', result.original, '→', result.corrected);
    }

    // Paste the (possibly corrected) text into the target app
    try {
      await pasteText(textToPaste);
      lastTranscription.text = textToPaste;
      console.log('[DEBUG] Paste complete after edit');
    } catch (err) {
      console.error('Paste failed:', err.message);
    }
    tray.setStatus('ready');
  });

  // ── Correction store ────────────────────────────────────────────────
  ipcMain.handle('corrections:getDict', () => correctionStore.getDictionary());
  ipcMain.handle('corrections:getLog', () => correctionStore.getLog());
  ipcMain.handle('corrections:addToDict', (_e, wrong, correct) => {
    correctionStore.addToDictionary(wrong, correct);
  });
  ipcMain.handle('corrections:removeFromDict', (_e, wrong) => {
    correctionStore.removeFromDictionary(wrong);
  });
}
