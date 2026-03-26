/**
 * Tests for src/main/ai-modes.js
 *
 * getModes and getModeList are pure functions over a static constant.
 * applyMode makes HTTP requests — we test its logic with mocked http/https.
 */

const aiModes = require('../src/main/ai-modes');

// ── getModes ───────────────────────────────────────────────────────────────

describe('getModes', () => {
  test('returns an object with the expected built-in mode keys', () => {
    const modes = aiModes.getModes();
    const keys = Object.keys(modes);
    expect(keys).toContain('raw');
    expect(keys).toContain('clean');
    expect(keys).toContain('email');
    expect(keys).toContain('slack');
    expect(keys).toContain('code_comment');
    expect(keys).toContain('translate_en');
    expect(keys).toContain('translate_ko');
  });

  test('returns exactly 7 built-in modes', () => {
    expect(Object.keys(aiModes.getModes()).length).toBe(7);
  });

  test('returns a shallow copy, not the internal object reference', () => {
    const a = aiModes.getModes();
    const b = aiModes.getModes();
    expect(a).not.toBe(b);
  });

  test('raw mode has a null prompt (no processing)', () => {
    expect(aiModes.getModes().raw.prompt).toBeNull();
  });

  test('every non-raw mode has a non-empty prompt string', () => {
    const modes = aiModes.getModes();
    for (const [id, mode] of Object.entries(modes)) {
      if (id === 'raw') continue;
      expect(typeof mode.prompt).toBe('string');
      expect(mode.prompt.length).toBeGreaterThan(0);
    }
  });

  test('every mode has a name and nameKo property', () => {
    for (const mode of Object.values(aiModes.getModes())) {
      expect(typeof mode.name).toBe('string');
      expect(typeof mode.nameKo).toBe('string');
    }
  });
});

// ── getModeList ────────────────────────────────────────────────────────────

describe('getModeList', () => {
  test('returns an array of 7 items', () => {
    expect(aiModes.getModeList().length).toBe(7);
  });

  test('each item has id, name, and nameKo properties', () => {
    for (const item of aiModes.getModeList()) {
      expect(typeof item.id).toBe('string');
      expect(typeof item.name).toBe('string');
      expect(typeof item.nameKo).toBe('string');
    }
  });

  test('ids in the list match the keys returned by getModes', () => {
    const modeKeys = new Set(Object.keys(aiModes.getModes()));
    for (const item of aiModes.getModeList()) {
      expect(modeKeys.has(item.id)).toBe(true);
    }
  });

  test('list does not expose the prompt field', () => {
    for (const item of aiModes.getModeList()) {
      expect(item.prompt).toBeUndefined();
    }
  });

  test('includes "raw" entry with correct name', () => {
    const rawEntry = aiModes.getModeList().find((m) => m.id === 'raw');
    expect(rawEntry).toBeDefined();
    expect(rawEntry.name).toBe('Raw');
    expect(rawEntry.nameKo).toBe('원본');
  });

  test('includes translate_en entry', () => {
    const entry = aiModes.getModeList().find((m) => m.id === 'translate_en');
    expect(entry).toBeDefined();
    expect(entry.name).toBe('Translate → English');
  });
});

// ── applyMode — raw mode (no HTTP call) ───────────────────────────────────

describe('applyMode — raw mode returns original text', () => {
  test('returns the original text without calling any API', async () => {
    const result = await aiModes.applyMode('raw', 'hello world');
    expect(result).toBe('hello world');
  });

  test('returns original text for an unknown mode id', async () => {
    const result = await aiModes.applyMode('nonexistent_mode', 'some text');
    expect(result).toBe('some text');
  });
});

// ── applyMode — API failure fallback ──────────────────────────────────────

describe('applyMode — fallback on API failure', () => {
  test('returns original text when the HTTP request errors', async () => {
    // Point at a port nothing listens on — request will fail immediately
    const config = {
      endpoint: 'http://127.0.0.1:1', // refused connection
      model: 'test-model',
      apiKey: '',
    };
    const result = await aiModes.applyMode('clean', 'test input', config);
    expect(result).toBe('test input');
  }, 10000);
});

// ── applyMode — selectedText context injection ─────────────────────────────

describe('applyMode — selectedText appended to prompt', () => {
  test('raw mode still returns original text even with selectedText', async () => {
    // raw mode returns early before any prompt is built
    const result = await aiModes.applyMode('raw', 'hello', {}, 'some context');
    expect(result).toBe('hello');
  });
});
