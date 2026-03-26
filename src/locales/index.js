const path = require('path');
const fs = require('fs');

let _locale = 'en';
let _strings = {};

const LOCALES_DIR = path.join(__dirname);

function load(locale) {
  _locale = locale || 'en';
  const file = path.join(LOCALES_DIR, `${_locale}.json`);
  try {
    _strings = JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    // Fallback to English
    _strings = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, 'en.json'), 'utf-8'));
  }
}

function t(key) {
  return _strings[key] || key;
}

function getLocale() { return _locale; }

function getAllStrings() { return { ..._strings }; }

module.exports = { load, t, getLocale, getAllStrings };
