/**
 * Tests for src/main/sounds.js
 *
 * sounds.js destructures execFile at require-time:
 *   const { execFile } = require('child_process');
 *
 * Because the binding is captured at module load, we cannot reassign
 * childProcess.execFile after the fact. Instead we use jest.spyOn on
 * the child_process module object BEFORE requiring sounds.js each test.
 */

const childProcess = require('child_process');
const path = require('path');

const SOUNDS_DIR = '/System/Library/Sounds';

let sounds;
let execFileSpy;

beforeEach(() => {
  jest.resetModules();
  // Spy on the property BEFORE sounds.js is loaded so the captured binding
  // is the spy itself.
  execFileSpy = jest
    .spyOn(childProcess, 'execFile')
    .mockImplementation((_cmd, _args, cb) => {
      if (cb) cb(null);
    });
  sounds = require('../src/main/sounds');
});

afterEach(() => {
  execFileSpy.mockRestore();
});

// ── play ──────────────────────────────────────────────────────────────────

describe('play', () => {
  test('calls execFile with "afplay" command', () => {
    sounds.play('Tink');
    expect(execFileSpy).toHaveBeenCalledWith(
      'afplay',
      expect.any(Array),
      expect.any(Function)
    );
  });

  test('passes the correct .aiff file path for a given sound name', () => {
    sounds.play('Pop');
    const [, args] = execFileSpy.mock.calls[0];
    expect(args[0]).toBe(path.join(SOUNDS_DIR, 'Pop.aiff'));
  });

  test('does not throw when execFile callback receives an error', () => {
    execFileSpy.mockImplementation((_cmd, _args, cb) => {
      if (cb) cb(new Error('afplay not found'));
    });
    expect(() => sounds.play('Tink')).not.toThrow();
  });
});

// ── playStart ─────────────────────────────────────────────────────────────

describe('playStart', () => {
  test('plays the "Tink" sound', () => {
    sounds.playStart();
    const [, args] = execFileSpy.mock.calls[0];
    expect(args[0]).toBe(path.join(SOUNDS_DIR, 'Tink.aiff'));
  });
});

// ── playStop ──────────────────────────────────────────────────────────────

describe('playStop', () => {
  test('plays the "Pop" sound', () => {
    sounds.playStop();
    const [, args] = execFileSpy.mock.calls[0];
    expect(args[0]).toBe(path.join(SOUNDS_DIR, 'Pop.aiff'));
  });
});

// ── playError ─────────────────────────────────────────────────────────────

describe('playError', () => {
  test('plays the "Basso" sound', () => {
    sounds.playError();
    const [, args] = execFileSpy.mock.calls[0];
    expect(args[0]).toBe(path.join(SOUNDS_DIR, 'Basso.aiff'));
  });
});

// ── each convenience function calls execFile exactly once ─────────────────

describe('each sound function invokes execFile exactly once', () => {
  test('playStart triggers one execFile call', () => {
    sounds.playStart();
    expect(execFileSpy).toHaveBeenCalledTimes(1);
  });

  test('playStop triggers one execFile call', () => {
    sounds.playStop();
    expect(execFileSpy).toHaveBeenCalledTimes(1);
  });

  test('playError triggers one execFile call', () => {
    sounds.playError();
    expect(execFileSpy).toHaveBeenCalledTimes(1);
  });
});
