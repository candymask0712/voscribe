/**
 * Snippet manager — voice trigger phrases that expand to pre-written text.
 * Stored in preferences as {trigger: expansion}.
 */

const preferences = require('./preferences');

/**
 * Check if text matches a snippet trigger. Case-insensitive, trimmed.
 * Returns expansion text or null.
 */
function matchSnippet(text) {
  const snippets = preferences.get('snippets') || {};
  const normalized = text.trim().replace(/[.!?。，,]+$/, '').trim().toLowerCase();

  for (const [trigger, expansion] of Object.entries(snippets)) {
    if (normalized === trigger.toLowerCase()) {
      return expansion;
    }
  }
  return null;
}

function getAll() {
  return preferences.get('snippets') || {};
}

function add(trigger, expansion) {
  const snippets = preferences.get('snippets') || {};
  snippets[trigger] = expansion;
  preferences.set('snippets', snippets);
}

function remove(trigger) {
  const snippets = preferences.get('snippets') || {};
  delete snippets[trigger];
  preferences.set('snippets', snippets);
}

module.exports = { matchSnippet, getAll, add, remove };
