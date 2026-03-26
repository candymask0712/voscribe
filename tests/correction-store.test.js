/**
 * Tests for src/main/correction-store.js
 *
 * correction-store.js depends on `electron` (app.getPath) and `fs`.
 * Strategy:
 *   - electron is auto-mocked via jest.config.js moduleNameMapper
 *   - fs is mocked; we re-require it after every jest.resetModules() so
 *     the test's `fs` reference always matches what the module captured
 *   - extractStem / extractCorrections are internal; tested through the
 *     public API (recordCorrection → getDictionary / getLog)
 *
 * Actual extractStem behaviour (verified):
 *   extractStem('리엑트를', '리액트를') → { original: '리엑', corrected: '리액' }
 *   (longest common suffix is '트를', so stems are '리엑' vs '리액')
 *   extractStem('teh', 'the')  → { original: 'teh', corrected: 'the' }
 *   extractStem('qick', 'quick') → { original: 'q', corrected: 'qu' }
 *   (longest common suffix is 'ick', stems are 'q' vs 'qu')
 */

jest.mock('fs');

let fs;
let store;

beforeEach(() => {
  jest.resetModules();
  // Re-require fs so we share the same mock instance as the module under test.
  fs = require('fs');

  // Simulate missing files — store initialises with empty log/dict.
  fs.readFileSync.mockImplementation(() => { throw new Error('ENOENT'); });
  fs.mkdirSync.mockImplementation(() => {});
  fs.writeFileSync.mockImplementation(() => {});

  store = require('../src/main/correction-store');
});

// ── getLog ────────────────────────────────────────────────────────────────

describe('getLog', () => {
  test('returns empty array when no log file exists', () => {
    expect(store.getLog()).toEqual([]);
  });

  test('returns a copy, not the internal reference', () => {
    const a = store.getLog();
    const b = store.getLog();
    expect(a).not.toBe(b);
  });
});

// ── getDictionary ─────────────────────────────────────────────────────────

describe('getDictionary', () => {
  test('returns empty object when no dict file exists', () => {
    expect(store.getDictionary()).toEqual({});
  });

  test('returns a shallow copy', () => {
    const a = store.getDictionary();
    const b = store.getDictionary();
    expect(a).not.toBe(b);
  });
});

// ── addToDictionary / removeFromDictionary ────────────────────────────────

describe('addToDictionary', () => {
  test('adds an entry that is retrievable via getDictionary', () => {
    store.addToDictionary('리엑트', '리액트');
    expect(store.getDictionary()['리엑트']).toBe('리액트');
  });

  test('overwrites an existing entry', () => {
    store.addToDictionary('teh', 'the');
    store.addToDictionary('teh', 'THE');
    expect(store.getDictionary()['teh']).toBe('THE');
  });

  test('persists by calling writeFileSync', () => {
    store.addToDictionary('foo', 'bar');
    expect(fs.writeFileSync).toHaveBeenCalled();
  });
});

describe('removeFromDictionary', () => {
  test('removes a previously added entry', () => {
    store.addToDictionary('teh', 'the');
    store.removeFromDictionary('teh');
    expect(store.getDictionary()['teh']).toBeUndefined();
  });

  test('is a no-op when the key does not exist', () => {
    expect(() => store.removeFromDictionary('nonexistent')).not.toThrow();
  });
});

// ── recordCorrection — extractCorrections behaviour ───────────────────────

describe('recordCorrection — same-length word pairs (extractStem path)', () => {
  test('records a simple English word correction in the log', () => {
    store.recordCorrection('teh quick brown fox', 'the quick brown fox');
    const log = store.getLog();
    expect(log.length).toBeGreaterThan(0);
    // extractStem('teh','the') → no common suffix → full words stored
    expect(log[0].original).toBe('teh');
    expect(log[0].corrected).toBe('the');
  });

  test('promotes correction to dictionary immediately (PROMOTION_THRESHOLD=1)', () => {
    store.recordCorrection('teh quick brown fox', 'the quick brown fox');
    expect(store.getDictionary()['teh']).toBe('the');
  });

  test('increments count on repeated correction', () => {
    store.recordCorrection('teh', 'the');
    store.recordCorrection('teh', 'the');
    const entry = store.getLog().find((e) => e.original === 'teh');
    expect(entry.count).toBe(2);
  });

  test('stores the stem extracted by extractStem for Korean words with particles', () => {
    // extractStem('리엑트를', '리액트를'):
    //   common suffix = '트를' (2 chars) → stems: '리엑' vs '리액'
    store.recordCorrection('리엑트를 배우고 있어요', '리액트를 배우고 있어요');
    const dict = store.getDictionary();
    expect(dict['리엑']).toBe('리액');
  });

  test('stores full word when extractStem finds no common suffix (teh/the)', () => {
    store.recordCorrection('teh fox', 'the fox');
    const dict = store.getDictionary();
    expect(dict['teh']).toBe('the');
  });

  test('stores stems for qick/quick (common suffix "ick", stems q/qu)', () => {
    // extractStem('qick', 'quick') → suffix 'ick', stems 'q' vs 'qu'
    store.recordCorrection('teh qick fox', 'the quick fox');
    const dict = store.getDictionary();
    expect(dict['teh']).toBe('the');
    expect(dict['q']).toBe('qu');
  });

  test('does nothing when original and corrected are identical', () => {
    store.recordCorrection('hello world', 'hello world');
    expect(store.getLog()).toEqual([]);
  });

  test('does nothing when either argument is falsy', () => {
    store.recordCorrection(null, 'hello');
    store.recordCorrection('hello', null);
    expect(store.getLog()).toEqual([]);
  });
});

describe('recordCorrection — different word count (full-text path)', () => {
  test('stores full-text pair when word counts differ and text is short', () => {
    store.recordCorrection('wanna go', 'want to go');
    const log = store.getLog();
    expect(log.some((e) => e.original === 'wanna go')).toBe(true);
  });

  test('skips full-text pair when text exceeds 60 chars', () => {
    const longText = 'a'.repeat(61);
    store.recordCorrection(longText, longText + ' extra word');
    expect(store.getLog()).toEqual([]);
  });
});

// ── applyCorrections ──────────────────────────────────────────────────────

describe('applyCorrections', () => {
  test('replaces a known wrong word with the correct word', () => {
    store.addToDictionary('teh', 'the');
    expect(store.applyCorrections('teh quick brown fox')).toBe('the quick brown fox');
  });

  test('is case-insensitive for the wrong word', () => {
    store.addToDictionary('teh', 'the');
    expect(store.applyCorrections('Teh quick fox')).toBe('the quick fox');
  });

  test('returns original text when dictionary is empty', () => {
    expect(store.applyCorrections('hello world')).toBe('hello world');
  });

  test('applies multiple dictionary entries in one pass', () => {
    store.addToDictionary('teh', 'the');
    store.addToDictionary('brwon', 'brown');
    const result = store.applyCorrections('teh brwon fox');
    expect(result).toBe('the brown fox');
  });
});

// ── getContextVocabulary ──────────────────────────────────────────────────

describe('getContextVocabulary', () => {
  test('returns empty array when dictionary is empty', () => {
    expect(store.getContextVocabulary()).toEqual([]);
  });

  test('returns unique corrected values', () => {
    store.addToDictionary('teh', 'the');
    store.addToDictionary('Teh', 'the');
    const vocab = store.getContextVocabulary();
    // "the" should appear only once
    expect(vocab.filter((v) => v === 'the').length).toBe(1);
  });

  test('includes all distinct corrected values', () => {
    store.addToDictionary('teh', 'the');
    store.addToDictionary('brwon', 'brown');
    const vocab = store.getContextVocabulary();
    expect(vocab).toContain('the');
    expect(vocab).toContain('brown');
  });
});

// ── _pruneDict behaviour (tested via addToDictionary) ────────────────────

describe('dictionary pruning', () => {
  test('removes an entry that is a substring extension of a shorter key', () => {
    // Add shorter stem first, then the extended form
    store.addToDictionary('리엑트', '리액트');
    store.addToDictionary('리엑트를', '리액트를');
    // After pruning, the longer key should be gone
    const dict = store.getDictionary();
    expect(dict['리엑트를']).toBeUndefined();
    expect(dict['리엑트']).toBe('리액트');
  });

  test('removes entries longer than 30 characters', () => {
    const longKey = 'a'.repeat(31);
    store.addToDictionary(longKey, 'replacement');
    expect(store.getDictionary()[longKey]).toBeUndefined();
  });

  test('keeps entries of exactly 30 characters', () => {
    const key30 = 'a'.repeat(30);
    store.addToDictionary(key30, 'replacement');
    expect(store.getDictionary()[key30]).toBe('replacement');
  });
});
