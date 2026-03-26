/**
 * Tests for src/main/preferences.js
 *
 * preferences.js depends on `electron` (app.getPath) and `fs`.
 * - electron is auto-mapped to our manual mock via jest.config.js
 * - fs is mocked via jest.mock so no real files are written
 *
 * IMPORTANT: jest.resetModules() clears the module registry, which means
 * the next require('fs') returns a fresh mock instance. We must re-require
 * fs AFTER resetModules in beforeEach so the test's `fs` variable and the
 * module under test share the same mock object.
 */

jest.mock('fs');

const path = require('path');
const os = require('os');

let prefs;
let fs;

beforeEach(() => {
  jest.resetModules();
  // Re-require fs after resetModules so we get the same instance that
  // preferences.js will capture when required below.
  fs = require('fs');

  // Simulate no existing prefs file → load() falls back to DEFAULTS
  fs.readFileSync.mockImplementation(() => { throw new Error('ENOENT'); });
  fs.mkdirSync.mockImplementation(() => {});
  fs.writeFileSync.mockImplementation(() => {});

  prefs = require('../src/main/preferences');
});

// ── DEFAULTS ──────────────────────────────────────────────────────────────

describe('DEFAULTS', () => {
  test('exports a DEFAULTS object', () => {
    expect(typeof prefs.DEFAULTS).toBe('object');
  });

  test('DEFAULTS contains hotkeyAccelerator', () => {
    expect(prefs.DEFAULTS.hotkeyAccelerator).toBe('Alt+Space');
  });

  test('DEFAULTS contains aiMode set to "raw"', () => {
    expect(prefs.DEFAULTS.aiMode).toBe('raw');
  });

  test('DEFAULTS contains soundEnabled set to true', () => {
    expect(prefs.DEFAULTS.soundEnabled).toBe(true);
  });

  test('DEFAULTS snippets is an empty object', () => {
    expect(prefs.DEFAULTS.snippets).toEqual({});
  });
});

// ── get — before any explicit load ────────────────────────────────────────

describe('get — lazy load on first access', () => {
  test('returns default value for a known key when no prefs file exists', () => {
    expect(prefs.get('aiMode')).toBe('raw');
  });

  test('returns default hotkeyAccelerator', () => {
    expect(prefs.get('hotkeyAccelerator')).toBe('Alt+Space');
  });

  test('returns undefined for a completely unknown key', () => {
    expect(prefs.get('completely_unknown_key_xyz')).toBeUndefined();
  });

  test('returns all prefs as an object when called with no argument', () => {
    const all = prefs.get();
    expect(typeof all).toBe('object');
    expect(all.aiMode).toBe('raw');
  });

  test('returns a copy when called with no argument, not internal ref', () => {
    const a = prefs.get();
    const b = prefs.get();
    expect(a).not.toBe(b);
  });
});

// ── get — with persisted data ─────────────────────────────────────────────

describe('get — merges saved values with defaults', () => {
  test('returns saved value that overrides default', () => {
    // Configure the mock, then reset+re-require so preferences.js sees it.
    jest.resetModules();
    fs = require('fs');
    const savedPrefs = { aiMode: 'clean', soundEnabled: false };
    fs.readFileSync.mockReturnValue(JSON.stringify(savedPrefs));
    fs.mkdirSync.mockImplementation(() => {});
    fs.writeFileSync.mockImplementation(() => {});
    prefs = require('../src/main/preferences');
    expect(prefs.get('aiMode')).toBe('clean');
  });

  test('falls back to default for a key not present in saved file', () => {
    jest.resetModules();
    fs = require('fs');
    fs.readFileSync.mockReturnValue(JSON.stringify({ aiMode: 'email' }));
    fs.mkdirSync.mockImplementation(() => {});
    fs.writeFileSync.mockImplementation(() => {});
    prefs = require('../src/main/preferences');
    // hotkeyAccelerator was not saved → should come from DEFAULTS
    expect(prefs.get('hotkeyAccelerator')).toBe('Alt+Space');
  });
});

// ── set ────────────────────────────────────────────────────────────────────

describe('set', () => {
  test('updates a key so that subsequent get returns the new value', () => {
    prefs.set('aiMode', 'email');
    expect(prefs.get('aiMode')).toBe('email');
  });

  test('calls writeFileSync to persist the change', () => {
    prefs.set('soundEnabled', false);
    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  test('can store a complex value (object)', () => {
    const snippets = { greeting: 'Hello!' };
    prefs.set('snippets', snippets);
    expect(prefs.get('snippets')).toEqual(snippets);
  });

  test('can store null for a nullable key', () => {
    prefs.set('micDeviceId', null);
    expect(prefs.get('micDeviceId')).toBeNull();
  });

  test('persists JSON that includes the updated key', () => {
    prefs.set('aiMode', 'slack');
    const writtenJson = fs.writeFileSync.mock.calls.at(-1)[1];
    const parsed = JSON.parse(writtenJson);
    expect(parsed.aiMode).toBe('slack');
  });
});

// ── getAll ────────────────────────────────────────────────────────────────

describe('getAll', () => {
  test('returns all preferences as a plain object', () => {
    const all = prefs.getAll();
    expect(typeof all).toBe('object');
  });

  test('returned object includes default keys', () => {
    const all = prefs.getAll();
    expect('aiMode' in all).toBe(true);
    expect('hotkeyAccelerator' in all).toBe(true);
  });

  test('returned object reflects a set() change', () => {
    prefs.set('aiMode', 'clean');
    expect(prefs.getAll().aiMode).toBe('clean');
  });
});

// ── load — error handling ─────────────────────────────────────────────────

describe('load — handles corrupted prefs file gracefully', () => {
  test('falls back to defaults when JSON is invalid', () => {
    jest.resetModules();
    fs = require('fs');
    fs.readFileSync.mockReturnValue('NOT_JSON{{{{');
    fs.mkdirSync.mockImplementation(() => {});
    fs.writeFileSync.mockImplementation(() => {});
    prefs = require('../src/main/preferences');
    // Accessing a key should not throw; should return default
    expect(prefs.get('aiMode')).toBe('raw');
  });
});

// ── save — error handling ─────────────────────────────────────────────────

describe('save — swallows write errors', () => {
  test('does not throw when writeFileSync fails', () => {
    fs.writeFileSync.mockImplementation(() => { throw new Error('EACCES'); });
    expect(() => prefs.set('aiMode', 'clean')).not.toThrow();
  });
});
