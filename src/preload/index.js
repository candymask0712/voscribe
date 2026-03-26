const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // ── Send (fire-and-forget) ──
  sendAudioData: (wavBuffer) => ipcRenderer.send('audio-data', wavBuffer),

  // ── Invoke (request-response) ──
  prefs: {
    get: (key) => ipcRenderer.invoke('prefs:get', key),
    set: (key, val) => ipcRenderer.invoke('prefs:set', key, val),
    getAll: () => ipcRenderer.invoke('prefs:getAll'),
  },

  perms: {
    check: () => ipcRenderer.invoke('perms:check'),
    requestAccessibility: () => ipcRenderer.invoke('perms:requestAccessibility'),
    requestMicrophone: () => ipcRenderer.invoke('perms:requestMicrophone'),
  },

  transcriber: {
    start: () => ipcRenderer.invoke('transcriber:start'),
    checkModel: (id) => ipcRenderer.invoke('transcriber:checkModel', id),
    getModelSize: (id) => ipcRenderer.invoke('transcriber:getModelSize', id),
    downloadModel: (id) => ipcRenderer.invoke('transcriber:downloadModel', id),
    loadModel: (id) => ipcRenderer.invoke('transcriber:loadModel', id),
    isLoaded: () => ipcRenderer.invoke('transcriber:isLoaded'),
  },

  onboarding: {
    complete: () => ipcRenderer.invoke('onboarding:complete'),
  },

  // ── Edit window ──
  onEditLoad: (cb) => {
    const handler = (_e, text) => cb(text);
    ipcRenderer.on('edit:load', handler);
    return () => ipcRenderer.removeListener('edit:load', handler);
  },

  sendEditResult: (result) => ipcRenderer.send('edit:result', result),

  corrections: {
    getDict: () => ipcRenderer.invoke('corrections:getDict'),
    getLog: () => ipcRenderer.invoke('corrections:getLog'),
    addToDict: (wrong, correct) => ipcRenderer.invoke('corrections:addToDict', wrong, correct),
    removeFromDict: (wrong) => ipcRenderer.invoke('corrections:removeFromDict', wrong),
  },

  // ── i18n ──
  i18n: {
    getStrings: () => ipcRenderer.invoke('i18n:getStrings'),
  },

  // ── Listen (main → renderer) ──
  onOverlayState: (cb) => {
    const handler = (_e, state, data) => cb(state, data);
    ipcRenderer.on('overlay-state', handler);
    return () => ipcRenderer.removeListener('overlay-state', handler);
  },

  onAudioCapture: (cb) => {
    const handler = (_e, action, deviceId) => cb(action, deviceId);
    ipcRenderer.on('audio-capture', handler);
    return () => ipcRenderer.removeListener('audio-capture', handler);
  },
});
