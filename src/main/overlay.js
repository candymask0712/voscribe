const { BrowserWindow, screen } = require('electron');
const path = require('path');

class OverlayManager {
  constructor() {
    this._win = null;
    this._ready = false;
    this._readyPromise = null;
    this._readyResolve = null;
  }

  _ensureWindow() {
    if (this._win && !this._win.isDestroyed()) return;

    this._ready = false;
    this._readyPromise = new Promise((resolve) => {
      this._readyResolve = resolve;
    });

    this._win = new BrowserWindow({
      width: 240,
      height: 50,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: false,
      hasShadow: false,
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload', 'index.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    this._win.setIgnoreMouseEvents(true);
    this._win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    this._win.setAlwaysOnTop(true, 'screen-saver');

    this._win.loadFile(
      path.join(__dirname, '..', 'renderer', 'overlay', 'index.html')
    );

    this._win.webContents.on('did-finish-load', () => {
      this._ready = true;
      if (this._readyResolve) this._readyResolve();
    });

    this._win.on('closed', () => {
      this._win = null;
      this._ready = false;
    });
  }

  _position() {
    if (!this._win) return;
    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    const { x, y, width } = display.workArea;
    this._win.setPosition(
      x + Math.round((width - 240) / 2),
      y + 60
    );
  }

  async _waitReady() {
    this._ensureWindow();
    if (!this._ready) await this._readyPromise;
  }

  async showRecording() {
    await this._waitReady();
    this._position();
    this._win.webContents.send('overlay-state', 'recording');
    this._win.showInactive();
  }

  showTranscribing() {
    if (!this._win || !this._ready) return;
    this._position();
    this._win.webContents.send('overlay-state', 'transcribing');
    if (!this._win.isVisible()) this._win.show();
  }

  showError(message) {
    if (!this._win || !this._ready) return;
    this._win.webContents.send('overlay-state', 'error', message);
    if (!this._win.isVisible()) this._win.show();
  }

  startAudioCapture(deviceId) {
    if (!this._win || !this._ready) return;
    this._win.webContents.send('audio-capture', 'start', deviceId || null);
  }

  stopAudioCapture() {
    if (!this._win || !this._ready) return;
    this._win.webContents.send('audio-capture', 'stop');
  }

  hide() {
    if (this._win && !this._win.isDestroyed()) {
      this._win.webContents.send('overlay-state', 'idle');
      this._win.hide();
    }
  }

  destroy() {
    if (this._win && !this._win.isDestroyed()) this._win.destroy();
    this._win = null;
  }
}

module.exports = OverlayManager;
