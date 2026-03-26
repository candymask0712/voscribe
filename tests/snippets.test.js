/**
 * Tests for src/main/snippets.js
 *
 * snippets.js delegates storage to preferences.js.
 * We mock preferences so no Electron/fs dependency is exercised.
 */

jest.mock('../src/main/preferences');

const preferences = require('../src/main/preferences');
const snippets = require('../src/main/snippets');

// Reset the mock storage before every test
let _store = {};

beforeEach(() => {
  _store = {};
  preferences.get.mockImplementation((key) => {
    if (key === 'snippets') return { ..._store };
    return undefined;
  });
  preferences.set.mockImplementation((key, value) => {
    if (key === 'snippets') _store = { ...value };
  });
});

// ── matchSnippet ───────────────────────────────────────────────────────────

describe('matchSnippet', () => {
  test('returns null when snippet store is empty', () => {
    expect(snippets.matchSnippet('hello')).toBeNull();
  });

  test('returns expansion for an exact-match trigger', () => {
    _store['hello'] = 'Hello, my name is John.';
    expect(snippets.matchSnippet('hello')).toBe('Hello, my name is John.');
  });

  test('matching is case-insensitive', () => {
    _store['hello'] = 'expansion text';
    expect(snippets.matchSnippet('HELLO')).toBe('expansion text');
    expect(snippets.matchSnippet('Hello')).toBe('expansion text');
  });

  test('trims leading and trailing whitespace before matching', () => {
    _store['hello'] = 'expansion';
    expect(snippets.matchSnippet('  hello  ')).toBe('expansion');
  });

  test('strips trailing period before matching', () => {
    _store['hello'] = 'expansion';
    expect(snippets.matchSnippet('hello.')).toBe('expansion');
  });

  test('strips trailing exclamation mark before matching', () => {
    _store['hey'] = 'expansion';
    expect(snippets.matchSnippet('hey!')).toBe('expansion');
  });

  test('strips trailing question mark before matching', () => {
    _store['what'] = 'expansion';
    expect(snippets.matchSnippet('what?')).toBe('expansion');
  });

  test('strips trailing comma before matching', () => {
    _store['so'] = 'expansion';
    expect(snippets.matchSnippet('so,')).toBe('expansion');
  });

  test('returns null for a partial match (trigger is a substring of input)', () => {
    _store['hello'] = 'expansion';
    expect(snippets.matchSnippet('hello world')).toBeNull();
  });

  test('returns null when no trigger matches the input', () => {
    _store['foo'] = 'bar';
    expect(snippets.matchSnippet('baz')).toBeNull();
  });

  test('returns null when preferences.get returns null', () => {
    preferences.get.mockReturnValue(null);
    expect(snippets.matchSnippet('anything')).toBeNull();
  });
});

// ── getAll ─────────────────────────────────────────────────────────────────

describe('getAll', () => {
  test('returns empty object when no snippets are stored', () => {
    expect(snippets.getAll()).toEqual({});
  });

  test('returns all stored snippets', () => {
    _store = { hello: 'expansion1', world: 'expansion2' };
    expect(snippets.getAll()).toEqual({ hello: 'expansion1', world: 'expansion2' });
  });

  test('returns empty object when preferences.get returns null', () => {
    preferences.get.mockReturnValue(null);
    expect(snippets.getAll()).toEqual({});
  });
});

// ── add ────────────────────────────────────────────────────────────────────

describe('add', () => {
  test('stores a new trigger-expansion pair', () => {
    snippets.add('greeting', 'Hello, world!');
    expect(_store['greeting']).toBe('Hello, world!');
  });

  test('overwrites an existing trigger', () => {
    snippets.add('greeting', 'Hello');
    snippets.add('greeting', 'Hi there');
    expect(_store['greeting']).toBe('Hi there');
  });

  test('calls preferences.set with key "snippets"', () => {
    snippets.add('foo', 'bar');
    expect(preferences.set).toHaveBeenCalledWith('snippets', expect.objectContaining({ foo: 'bar' }));
  });
});

// ── remove ─────────────────────────────────────────────────────────────────

describe('remove', () => {
  test('deletes a trigger that was previously added', () => {
    _store['greeting'] = 'Hello';
    snippets.remove('greeting');
    expect(_store['greeting']).toBeUndefined();
  });

  test('is a no-op when the trigger does not exist', () => {
    expect(() => snippets.remove('nonexistent')).not.toThrow();
  });

  test('calls preferences.set after removal', () => {
    _store['foo'] = 'bar';
    snippets.remove('foo');
    expect(preferences.set).toHaveBeenCalled();
  });
});
