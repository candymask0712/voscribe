const { execFile } = require('child_process');
const path = require('path');

const SOUNDS_DIR = '/System/Library/Sounds';

function play(name) {
  const soundPath = path.join(SOUNDS_DIR, `${name}.aiff`);
  execFile('afplay', [soundPath], (err) => {
    if (err) console.error('[SOUND] play failed:', name, err.message);
  });
}

function playStart() { play('Tink'); }
function playStop() { play('Pop'); }
function playError() { play('Basso'); }

module.exports = { play, playStart, playStop, playError };
