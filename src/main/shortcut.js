const { globalShortcut } = require('electron');

class ShortcutManager {
  constructor() {
    this._registered = new Map();
  }

  register(accelerator, callback) {
    try {
      const ok = globalShortcut.register(accelerator, callback);
      if (ok) {
        this._registered.set(accelerator, callback);
      } else {
        console.warn(`Shortcut already in use: ${accelerator}`);
      }
      return ok;
    } catch (err) {
      console.error(`Failed to register shortcut ${accelerator}:`, err.message);
      return false;
    }
  }

  unregister(accelerator) {
    if (this._registered.has(accelerator)) {
      globalShortcut.unregister(accelerator);
      this._registered.delete(accelerator);
    }
  }

  unregisterAll() {
    globalShortcut.unregisterAll();
    this._registered.clear();
  }

  isRegistered(accelerator) {
    return globalShortcut.isRegistered(accelerator);
  }
}

module.exports = ShortcutManager;
