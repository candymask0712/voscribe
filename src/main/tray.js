const { Tray, Menu, nativeImage, app } = require('electron');
const path = require('path');
const fs = require('fs');
let i18n;
try { i18n = require('../locales'); } catch { i18n = { t: (k) => k }; }

// 16x16 transparent PNG (base64) — used as minimal tray icon
const TRANSPARENT_1PX =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=';

const MAX_HISTORY = 10;

class TrayManager {
  constructor(callbacks = {}) {
    this._callbacks = callbacks;
    this._status = 'initializing';
    this._tray = null;
    this._history = []; // [{text, timestamp}]
    this._create();
  }

  _create() {
    const icon = this._loadIcon();
    console.log('[TRAY] icon empty?', icon.isEmpty(), 'size:', icon.getSize());
    this._tray = new Tray(icon);
    this._tray.setToolTip('voscribe');
    this._tray.setTitle('voscribe');
    console.log('[TRAY] created successfully');
    this._rebuildMenu();
  }

  _loadIcon() {
    const iconPaths = [
      path.join(process.resourcesPath || '', 'assets', 'iconTemplate.png'),
      path.join(__dirname, '..', '..', 'assets', 'iconTemplate.png'),
    ];
    for (const p of iconPaths) {
      console.log('[TRAY] trying icon path:', p, 'exists:', fs.existsSync(p));
      try {
        if (fs.existsSync(p)) {
          const img = nativeImage.createFromPath(p);
          if (!img.isEmpty()) {
            img.setTemplateImage(true);
            console.log('[TRAY] loaded icon from:', p, 'size:', img.getSize());
            return img;
          }
        }
      } catch (e) {
        console.error('[TRAY] icon load error:', e.message);
      }
    }
    // Fallback: create 16x16 icon from raw RGBA data
    console.log('[TRAY] using fallback icon');
    const size = 16;
    const buf = Buffer.alloc(size * size * 4, 0);
    // Draw a filled circle (microphone dot)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - 7.5, dy = y - 7.5;
        if (dx * dx + dy * dy <= 36) {
          const off = (y * size + x) * 4;
          buf[off] = 0; buf[off + 1] = 0; buf[off + 2] = 0; buf[off + 3] = 255;
        }
      }
    }
    const img = nativeImage.createFromBitmap(buf, { width: size, height: size });
    img.setTemplateImage(true);
    return img;
  }

  _statusLabel() {
    const t = i18n.t || ((k) => k);
    const key = `status_${this._status}`;
    return `  ${t(key)}`;
  }

  _rebuildMenu() {
    if (!this._tray) return;

    const template = [
      { label: 'voscribe', enabled: false },
      { type: 'separator' },
      { label: this._statusLabel(), enabled: false },
      { type: 'separator' },
    ];

    // History submenu
    if (this._history.length > 0) {
      const histItems = this._history.map((h) => {
        const preview = h.text.length > 40 ? h.text.slice(0, 40) + '...' : h.text;
        return {
          label: preview,
          click: () => {
            if (this._callbacks.onHistoryClick) this._callbacks.onHistoryClick(h.text);
          },
        };
      });
      template.push({ label: i18n.t('recent'), submenu: histItems });
      template.push({ type: 'separator' });
    }

    if (this._callbacks.onSettingsClick) {
      template.push({ label: i18n.t('settings'), click: this._callbacks.onSettingsClick });
      template.push({ type: 'separator' });
    }

    template.push({ label: i18n.t('quit'), click: () => app.quit() });

    this._tray.setContextMenu(Menu.buildFromTemplate(template));
  }

  setStatus(status) {
    this._status = status;
    this._rebuildMenu();

    // Show brief indicator text next to tray icon
    if (status === 'recording') {
      this._tray.setTitle(' REC');
    } else if (status === 'transcribing') {
      this._tray.setTitle(' ...');
    } else {
      this._tray.setTitle('');
    }
  }

  addHistory(text) {
    this._history.unshift({ text, timestamp: Date.now() });
    if (this._history.length > MAX_HISTORY) this._history.pop();
    this._rebuildMenu();
  }

  getStatus() {
    return this._status;
  }

  destroy() {
    if (this._tray) {
      this._tray.destroy();
      this._tray = null;
    }
  }
}

module.exports = TrayManager;
