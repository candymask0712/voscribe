const { BrowserWindow } = require('electron');
const path = require('path');

class SettingsWindow {
  constructor() {
    this._win = null;
  }

  show() {
    if (this._win && !this._win.isDestroyed()) {
      this._win.focus();
      return;
    }

    this._win = new BrowserWindow({
      width: 440,
      height: 520,
      resizable: false,
      maximizable: false,
      fullscreenable: false,
      title: 'Settings — voscribe',
      titleBarStyle: 'hiddenInset',
      show: false,
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload', 'index.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    this._win.loadFile(
      path.join(__dirname, '..', 'renderer', 'settings', 'index.html')
    );

    this._win.once('ready-to-show', () => {
      this._win.show();
      this._win.center();
    });

    // Destroy on close — prevent ghost window from reappearing
    this._win.on('close', () => {
      if (this._win && !this._win.isDestroyed()) this._win.destroy();
    });
    this._win.on('closed', () => { this._win = null; });
  }

  close() {
    if (this._win && !this._win.isDestroyed()) {
      this._win.destroy();
      this._win = null;
    }
  }

  forceClose() {
    this.close();
  }
}

module.exports = SettingsWindow;
