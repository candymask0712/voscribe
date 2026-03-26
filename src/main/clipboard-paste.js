const { clipboard } = require('electron');
const { execFile } = require('child_process');

function runAppleScript(script) {
  return new Promise((resolve, reject) => {
    execFile('osascript', ['-e', script], (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout.trim());
    });
  });
}

// ── Target app tracking ───────────────────────────────────────────────
let _savedAppName = null;

async function saveTargetApp() {
  try {
    _savedAppName = await runAppleScript(
      'tell application "System Events" to get name of first application process whose frontmost is true'
    );
  } catch {
    _savedAppName = null;
  }
}

async function activateTargetApp() {
  if (!_savedAppName) return;
  try {
    await runAppleScript(`
      tell application "System Events"
        set frontProcess to first application process whose name is "${_savedAppName}"
        set frontmost of frontProcess to true
      end tell
    `);
    await new Promise((r) => setTimeout(r, 300));
  } catch (err) {
    console.error('Failed to activate target app:', err.message);
  }
}

function getTargetAppName() {
  return _savedAppName;
}

// ── Paste ─────────────────────────────────────────────────────────────
async function pasteText(text) {
  clipboard.writeText(text);
  await new Promise((r) => setTimeout(r, 150));
  try {
    await runAppleScript(
      'tell application "System Events" to keystroke "v" using command down'
    );
  } catch (err) {
    console.error('Paste failed:', err.message);
  }
}

// ── Backspace + replace ───────────────────────────────────────────────
async function replaceLastText(oldText, newText) {
  await activateTargetApp();
  try {
    await runAppleScript(`
      tell application "System Events"
        repeat ${oldText.length} times
          key code 51
        end repeat
      end tell
    `);
  } catch (err) {
    console.error('Backspace failed:', err.message);
  }
  await new Promise((r) => setTimeout(r, 100));
  await pasteText(newText);
}

// ── Selected text capture ─────────────────────────────────────────────
async function getSelectedText() {
  const saved = clipboard.readText();
  clipboard.writeText('');
  try {
    await runAppleScript(
      'tell application "System Events" to keystroke "c" using command down'
    );
    await new Promise((r) => setTimeout(r, 150));
    const selected = clipboard.readText();
    clipboard.writeText(saved || '');
    if (selected && selected !== saved) return selected;
  } catch {}
  clipboard.writeText(saved || '');
  return null;
}

module.exports = { pasteText, replaceLastText, saveTargetApp, activateTargetApp, getSelectedText, getTargetAppName };
