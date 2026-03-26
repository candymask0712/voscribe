/**
 * Post-processing pipeline for transcribed text.
 * Applied after ASR and before correction dictionary.
 */

// Korean filler words / false starts
const KO_FILLERS = [
  '음', '어', '엄', '아', '아아', '에', '그', '그어', '저', '저기',
  '있잖아', '뭐냐', '뭐지', '그러니까', '말하자면',
];

// English filler words
const EN_FILLERS = [
  'um', 'uh', 'uhh', 'umm', 'hmm', 'hm',
  'like', 'you know', 'I mean', 'so yeah',
  'basically', 'actually', 'literally',
];

// Build regex: match fillers at word boundaries, optionally followed by comma/period
function buildFillerRegex(fillers) {
  const escaped = fillers
    .sort((a, b) => b.length - a.length) // longest first
    .map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  // Match filler optionally followed by comma/space, at start or after space
  return new RegExp(
    `(?:^|(?<=\\s))(?:${escaped.join('|')})(?:[,.]?\\s*)?`,
    'gi'
  );
}

const KO_RE = buildFillerRegex(KO_FILLERS);
const EN_RE = buildFillerRegex(EN_FILLERS);

/**
 * Remove filler words from text.
 */
function removeFillers(text) {
  let result = text;
  result = result.replace(KO_RE, '');
  result = result.replace(EN_RE, '');
  // Clean up double spaces and leading/trailing whitespace
  result = result.replace(/\s{2,}/g, ' ').trim();
  // Fix orphaned punctuation at start
  result = result.replace(/^[,.\s]+/, '');
  return result;
}

/**
 * Full post-processing pipeline.
 */
function postProcess(text, options = {}) {
  let result = text;

  if (options.removeFillers !== false) {
    result = removeFillers(result);
  }

  return result;
}

module.exports = { postProcess, removeFillers };
