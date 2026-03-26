const { BrowserWindow } = require('electron');
const path = require('path');

class OnboardingWindow {
  constructor() {
    this._win = null;
  }

  show(onClose) {
    if (this._win && !this._win.isDestroyed()) {
      this._win.focus();
      return;
    }

    this._win = new BrowserWindow({
      width: 480,
      height: 540,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      title: 'voscribe',
      titleBarStyle: 'hiddenInset',
      show: false,
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload', 'index.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    this._win.loadFile(
      path.join(__dirname, '..', 'renderer', 'onboarding', 'index.html')
    );

    this._win.once('ready-to-show', () => {
      this._win.show();
      this._win.center();
    });

    this._win.on('closed', () => {
      this._win = null;
      if (onClose) onClose();
    });
  }

  close() {
    if (this._win && !this._win.isDestroyed()) {
      this._win.close();
    }
  }

  isOpen() {
    return this._win !== null && !this._win.isDestroyed();
  }
}

module.exports = OnboardingWindow;
