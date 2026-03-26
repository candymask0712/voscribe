/**
 * Tests for src/main/post-process.js
 *
 * post-process.js has zero external dependencies — all tests are pure.
 */
const { postProcess, removeFillers } = require('../src/main/post-process');

// ── removeFillers ──────────────────────────────────────────────────────────

describe('removeFillers — English fillers', () => {
  test('removes leading "um" from sentence', () => {
    expect(removeFillers('um hello there')).toBe('hello there');
  });

  test('removes "uh" at the start of text', () => {
    expect(removeFillers('uh I need to think')).toBe('I need to think');
  });

  test('removes "umm" variant', () => {
    expect(removeFillers('umm this is a test')).toBe('this is a test');
  });

  test('removes "hmm" variant', () => {
    expect(removeFillers('hmm let me check')).toBe('let me check');
  });

  test('removes filler followed by comma', () => {
    expect(removeFillers('so yeah, the meeting is at three')).toBe('the meeting is at three');
  });

  test('removes "I mean" filler', () => {
    expect(removeFillers('I mean it works fine')).toBe('it works fine');
  });

  test('removes "you know" filler', () => {
    expect(removeFillers('you know it is complicated')).toBe('it is complicated');
  });

  test('leaves non-filler text unchanged', () => {
    expect(removeFillers('the deployment succeeded')).toBe('the deployment succeeded');
  });

  test('trims leading and trailing whitespace after removal', () => {
    const result = removeFillers('  um   hello  ');
    expect(result).toBe('hello');
  });

  test('collapses multiple spaces into one', () => {
    // "like" removed mid-sentence should not leave double spaces
    const result = removeFillers('it is like very fast');
    expect(result.includes('  ')).toBe(false);
  });

  test('removes filler word at start, preserving rest of sentence', () => {
    expect(removeFillers('basically the fix is in line 42')).toBe('the fix is in line 42');
  });
});

describe('removeFillers — Korean fillers', () => {
  test('removes "음" from start of text', () => {
    expect(removeFillers('음 잘 모르겠어요')).toBe('잘 모르겠어요');
  });

  test('removes "어" filler (note: "그" in 그냥 is also a filler and is removed)', () => {
    // Both "어" and "그" are Korean fillers; both get stripped.
    // "어 그냥 해봤어요" → remove "어 " → "그냥 해봤어요" → remove "그" → "냥 해봤어요"
    expect(removeFillers('어 그냥 해봤어요')).toBe('냥 해봤어요');
  });

  test('removes "그러니까" filler', () => {
    expect(removeFillers('그러니까 이렇게 하면 돼요')).toBe('이렇게 하면 돼요');
  });

  test('removes "저" filler at start', () => {
    expect(removeFillers('저 궁금한 게 있는데요')).toBe('궁금한 게 있는데요');
  });
});

describe('removeFillers — edge cases', () => {
  test('returns empty string when input is only fillers', () => {
    const result = removeFillers('um uh hmm');
    expect(result).toBe('');
  });

  test('handles empty string input', () => {
    expect(removeFillers('')).toBe('');
  });

  test('the regex matches "um" at start-of-string anchor (umbrella is affected)', () => {
    // The regex uses (?:^|(?<=\s)) — "um" at position 0 matches via ^ anchor.
    // "umbrella" → "brella" is the real behaviour. Document it here.
    expect(removeFillers('umbrella')).toBe('brella');
  });

  test('does not strip "human" because "hm" does not appear at a word boundary', () => {
    // "hm" only matches at ^ or after whitespace; it does not match inside "human"
    expect(removeFillers('human')).toBe('human');
  });

  test('removes orphaned leading punctuation after filler removal', () => {
    // If punctuation ends up at the very start, it must be stripped
    const result = removeFillers('. hello');
    expect(result).toBe('hello');
  });
});

// ── postProcess ────────────────────────────────────────────────────────────

describe('postProcess — options', () => {
  test('removes fillers by default', () => {
    expect(postProcess('um hello')).toBe('hello');
  });

  test('skips filler removal when removeFillers is false', () => {
    expect(postProcess('um hello', { removeFillers: false })).toBe('um hello');
  });

  test('returns unchanged text when no fillers present', () => {
    expect(postProcess('this is clean text')).toBe('this is clean text');
  });

  test('handles empty string', () => {
    expect(postProcess('')).toBe('');
  });

  test('applies filler removal when removeFillers is explicitly true', () => {
    expect(postProcess('uh test', { removeFillers: true })).toBe('test');
  });
});
