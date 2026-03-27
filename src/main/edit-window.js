const { BrowserWindow, screen } = require('electron');
const path = require('path');

class EditWindow {
  constructor() {
    this._win = null;
  }

  show(originalText) {
    // Always destroy and recreate to avoid stale window issues
    if (this._win && !this._win.isDestroyed()) {
      this._win.destroy();
      this._win = null;
    }

    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    const { x, y, width } = display.workArea;
    const winW = 420;
    const winH = 200;

    this._win = new BrowserWindow({
      width: winW,
      height: winH,
      x: x + Math.round((width - winW) / 2),
      y: y + 120,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload', 'index.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    this._win.setAlwaysOnTop(true, 'screen-saver');
    this._win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    this._win.loadFile(
      path.join(__dirname, '..', 'renderer', 'edit', 'index.html')
    );

    this._win.webContents.on('did-finish-load', () => {
      this._win.webContents.send('edit:load', originalText);
      this._win.showInactive();
      // Use setTimeout to focus after the window is fully rendered
      setTimeout(() => {
        if (this._win && !this._win.isDestroyed()) {
          this._win.focus();
        }
      }, 100);
    });

    this._win.on('closed', () => {
      this._win = null;
    });
  }

  hide() {
    if (this._win && !this._win.isDestroyed()) {
      this._win.destroy();
      this._win = null;
    }
  }

  isVisible() {
    return this._win && !this._win.isDestroyed() && this._win.isVisible();
  }

  destroy() {
    if (this._win && !this._win.isDestroyed()) this._win.destroy();
    this._win = null;
  }
}

module.exports = EditWindow;
