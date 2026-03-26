const { BrowserWindow, screen } = require('electron');
const path = require('path');

class EditWindow {
  constructor() {
    this._win = null;
  }

  show(originalText) {
    if (this._win && !this._win.isDestroyed()) {
      // Reuse — update content
      this._win.webContents.send('edit:load', originalText);
      this._win.show();
      this._win.focus();
      return;
    }

    // Position near cursor
    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    const { x, y, width } = display.workArea;
    const winW = 420;
    const winH = 200;
    const px = x + Math.round((width - winW) / 2);
    const py = y + 120;

    this._win = new BrowserWindow({
      width: winW,
      height: winH,
      x: px,
      y: py,
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

    this._win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    this._win.loadFile(
      path.join(__dirname, '..', 'renderer', 'edit', 'index.html')
    );

    this._win.webContents.on('did-finish-load', () => {
      this._win.webContents.send('edit:load', originalText);
      this._win.show();
      this._win.focus();
    });

    this._win.on('closed', () => {
      this._win = null;
    });
  }

  hide() {
    if (this._win && !this._win.isDestroyed()) {
      this._win.hide();
    }
  }

  isVisible() {
    return this._win && !this._win.isDestroyed() && this._win.isVisible();
  }

  destroy() {
    if (this._win && !this._win.isDestroyed()) {
      this._win.destroy();
    }
    this._win = null;
  }
}

module.exports = EditWindow;
