/**
 * AI post-processing modes.
 * Sends transcribed text through an LLM to adjust tone/format.
 * Supports Ollama (local) or any OpenAI-compatible API.
 */

const http = require('http');
const https = require('https');

// ── Built-in mode definitions ─────────────────────────────────────────
const BUILT_IN_MODES = {
  raw: {
    name: 'Raw',
    nameKo: '원본',
    prompt: null, // no processing
  },
  clean: {
    name: 'Clean',
    nameKo: '정리',
    prompt: 'Fix grammar, remove filler words, and clean up the following transcribed speech. Keep the original language and meaning. Output only the cleaned text, nothing else.',
  },
  email: {
    name: 'Email',
    nameKo: '이메일',
    prompt: 'Rewrite the following transcribed speech as a professional email. Keep the original language. Output only the email body text, no subject line.',
  },
  slack: {
    name: 'Slack/Chat',
    nameKo: '채팅',
    prompt: 'Rewrite the following transcribed speech as a short, casual chat message. Keep the original language. Output only the message.',
  },
  code_comment: {
    name: 'Code Comment',
    nameKo: '코드 주석',
    prompt: 'Convert the following transcribed speech into a concise code comment (// style). Keep technical terms in English. Output only the comment text.',
  },
  translate_en: {
    name: 'Translate → English',
    nameKo: '영어로 번역',
    prompt: 'Translate the following text to English. Output only the translation.',
  },
  translate_ko: {
    name: 'Translate → Korean',
    nameKo: '한국어로 번역',
    prompt: 'Translate the following text to Korean. Output only the translation.',
  },
};

// ── LLM API call ──────────────────────────────────────────────────────
function callAPI(endpoint, apiKey, model, systemPrompt, userText) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;

    const body = JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userText },
      ],
      temperature: 0.3,
      max_tokens: 2048,
    });

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
    };

    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const content =
            json.choices?.[0]?.message?.content ||
            json.message?.content ||
            '';
          resolve(content.trim());
        } catch (e) {
          reject(new Error(`API parse error: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('API timeout'));
    });
    req.write(body);
    req.end();
  });
}

// ── Public API ────────────────────────────────────────────────────────

function getModes() {
  return { ...BUILT_IN_MODES };
}

function getModeList() {
  return Object.entries(BUILT_IN_MODES).map(([id, m]) => ({
    id,
    name: m.name,
    nameKo: m.nameKo,
  }));
}

/**
 * Apply an AI mode to transcribed text.
 * @param {string} modeId - Mode identifier
 * @param {string} text - Transcribed text
 * @param {object} config - {endpoint, apiKey, model}
 * @param {string} [selectedText] - Optional selected text for context
 * @returns {string} Processed text, or original if mode is 'raw' or API fails
 */
async function applyMode(modeId, text, config = {}, selectedText = null) {
  const mode = BUILT_IN_MODES[modeId];
  if (!mode || !mode.prompt) return text; // raw mode or unknown

  const endpoint = config.endpoint || 'http://localhost:11434/v1/chat/completions';
  const model = config.model || 'llama3.2';
  const apiKey = config.apiKey || '';

  let prompt = mode.prompt;
  if (selectedText) {
    prompt += `\n\nContext (selected text in the editor):\n${selectedText}`;
  }

  try {
    const result = await callAPI(endpoint, apiKey, model, prompt, text);
    if (result) {
      console.log(`[AI-MODE] ${modeId}: processed OK`);
      return result;
    }
    return text;
  } catch (err) {
    console.error(`[AI-MODE] ${modeId} failed:`, err.message);
    return text; // fallback to original
  }
}

module.exports = { getModes, getModeList, applyMode };
