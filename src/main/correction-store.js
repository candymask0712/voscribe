const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(app.getPath('userData'), 'corrections');
const LOG_FILE = path.join(DATA_DIR, 'log.json');
const DICT_FILE = path.join(DATA_DIR, 'dictionary.json');

const PROMOTION_THRESHOLD = 1; // immediately promote on first correction

let _log = null;   // [{original, corrected, count, lastSeen}]
let _dict = null;  // {wrong: correct}

// ── Persistence ───────────────────────────────────────────────────────
function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadLog() {
  if (_log) return;
  try {
    _log = JSON.parse(fs.readFileSync(LOG_FILE, 'utf-8'));
  } catch {
    _log = [];
  }
}

function saveLog() {
  ensureDir();
  fs.writeFileSync(LOG_FILE, JSON.stringify(_log, null, 2));
}

function loadDict() {
  if (_dict) return;
  try {
    _dict = JSON.parse(fs.readFileSync(DICT_FILE, 'utf-8'));
    _pruneDict();
    saveDict();
  } catch {
    _dict = {};
  }
}

function saveDict() {
  ensureDir();
  fs.writeFileSync(DICT_FILE, JSON.stringify(_dict, null, 2));
}

// ── Diff extraction ───────────────────────────────────────────────────

/**
 * Extract the stem correction from two words that differ.
 * Handles Korean particles (조사): "리엑트를" vs "리액트를" → "리엑트" → "리액트"
 */
function extractStem(oldWord, newWord) {
  // Find longest common suffix (Korean particles: 를, 는, 가, 에서, 으로, ...)
  let suffixLen = 0;
  while (
    suffixLen < oldWord.length - 1 &&
    suffixLen < newWord.length - 1 &&
    oldWord[oldWord.length - 1 - suffixLen] === newWord[newWord.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  const oldStem = suffixLen > 0 ? oldWord.slice(0, -suffixLen) : oldWord;
  const newStem = suffixLen > 0 ? newWord.slice(0, -suffixLen) : newWord;

  if (oldStem && newStem && oldStem !== newStem) {
    return { original: oldStem, corrected: newStem };
  }
  return null;
}

function extractCorrections(original, corrected) {
  if (original === corrected) return [];

  const origWords = original.split(/\s+/);
  const corrWords = corrected.split(/\s+/);
  const seen = new Set();
  const pairs = [];

  function addPair(o, c) {
    if (o && c && o !== c && !seen.has(o)) {
      seen.add(o);
      pairs.push({ original: o, corrected: c });
    }
  }

  // Word-level diff: extract only the stem (minimal correction)
  if (origWords.length === corrWords.length) {
    for (let i = 0; i < origWords.length; i++) {
      if (origWords[i] !== corrWords[i]) {
        // Extract stem without Korean particle suffix
        const stem = extractStem(origWords[i], corrWords[i]);
        if (stem) {
          addPair(stem.original, stem.corrected);
        } else {
          // No common suffix — store the full word
          addPair(origWords[i], corrWords[i]);
        }
      }
    }
  } else {
    // Word count differs — try to find common changed segments
    // Fall back to full-text only if short
    if (original.length < 60) {
      addPair(original.trim(), corrected.trim());
    }
  }

  return pairs;
}

// ── Dictionary pruning ────────────────────────────────────────────────

/**
 * Remove redundant dictionary entries:
 * 1. Long entries (>30 chars) that are covered by a shorter stem
 * 2. Entries where the key is a substring extension of another key
 *    (e.g., "리액트를" is redundant when "리액트" exists)
 */
function _pruneDict() {
  if (!_dict) return;

  const keys = Object.keys(_dict);
  // Sort shortest first — short stems take priority
  keys.sort((a, b) => a.length - b.length);

  const keep = {};
  for (const key of keys) {
    // Skip long full-sentence entries (>30 chars)
    if (key.length > 30) continue;

    // Check if this key is already covered by a shorter existing key
    let covered = false;
    for (const existing of Object.keys(keep)) {
      if (key.includes(existing) && key !== existing) {
        covered = true;
        break;
      }
    }

    if (!covered) {
      keep[key] = _dict[key];
    }
  }

  _dict = keep;
}

// ── Public API ────────────────────────────────────────────────────────

/**
 * Record a user correction. Auto-promotes to dictionary if threshold is met.
 */
function recordCorrection(originalText, correctedText) {
  if (!originalText || !correctedText) return;
  if (originalText.trim() === correctedText.trim()) return;

  loadLog();
  loadDict();

  const pairs = extractCorrections(originalText, correctedText);
  const now = new Date().toISOString();
  const promoted = [];

  for (const { original, corrected } of pairs) {
    // Find existing entry
    const existing = _log.find(
      (e) => e.original === original && e.corrected === corrected
    );

    if (existing) {
      existing.count += 1;
      existing.lastSeen = now;
    } else {
      _log.push({ original, corrected, count: 1, lastSeen: now });
    }

    // Auto-promote to dictionary
    const entry = existing || _log[_log.length - 1];
    if (entry.count >= PROMOTION_THRESHOLD && !_dict[original]) {
      _dict[original] = corrected;
      promoted.push({ original, corrected });
    }
  }

  // Clean up redundant entries after every promotion
  if (promoted.length > 0) {
    _pruneDict();
  }

  saveLog();
  saveDict();

  return promoted;
}

/**
 * Apply correction dictionary to a transcribed text (post-processing).
 */
function applyCorrections(text) {
  loadDict();
  if (!_dict || Object.keys(_dict).length === 0) return text;

  let result = text;
  for (const [wrong, correct] of Object.entries(_dict)) {
    // Case-insensitive, whole-ish match (word boundary where possible)
    try {
      const escaped = wrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(escaped, 'gi');
      result = result.replace(re, correct);
    } catch {
      // If regex fails, do simple replace
      result = result.split(wrong).join(correct);
    }
  }
  return result;
}

/**
 * Get vocabulary list for ASR context injection.
 * Returns unique corrected words/phrases from the dictionary.
 */
function getContextVocabulary() {
  loadDict();
  if (!_dict) return [];
  return [...new Set(Object.values(_dict))];
}

/**
 * Get the full correction dictionary.
 */
function getDictionary() {
  loadDict();
  return { ..._dict };
}

/**
 * Get the correction log.
 */
function getLog() {
  loadLog();
  return [..._log];
}

/**
 * Manually add a dictionary entry.
 */
function addToDictionary(wrong, correct) {
  loadDict();
  _dict[wrong] = correct;
  _pruneDict();
  saveDict();
}

/**
 * Remove a dictionary entry.
 */
function removeFromDictionary(wrong) {
  loadDict();
  delete _dict[wrong];
  saveDict();
}

module.exports = {
  recordCorrection,
  applyCorrections,
  getContextVocabulary,
  getDictionary,
  getLog,
  addToDictionary,
  removeFromDictionary,
};
