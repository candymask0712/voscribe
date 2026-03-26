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
    console.log('[PASTE] saved target app:', _savedAppName);
  } catch {
    _savedAppName = null;
  }
}

async function activateTargetApp() {
  if (!_savedAppName) return;
  try {
    // Use process name to activate — more reliable than app name
    await runAppleScript(`
      tell application "System Events"
        set frontProcess to first application process whose name is "${_savedAppName}"
        set frontmost of frontProcess to true
      end tell
    `);
    await new Promise((r) => setTimeout(r, 300));
    console.log('[PASTE] activated:', _savedAppName);
  } catch (err) {
    console.error('[PASTE] activate failed:', err.message);
  }
}

// ── Paste (simple, no clipboard restore) ──────────────────────────────
async function pasteText(text) {
  // Write text to clipboard — it stays there even if paste fails,
  // so the user can always manually Cmd+V
  clipboard.writeText(text);
  await new Promise((r) => setTimeout(r, 150));

  try {
    await runAppleScript(
      'tell application "System Events" to keystroke "v" using command down'
    );
    console.log('[PASTE] Cmd+V sent');
  } catch (err) {
    console.error('[PASTE] Cmd+V failed:', err.message);
  }
}

// ── Backspace + replace ───────────────────────────────────────────────
async function replaceLastText(oldText, newText) {
  await activateTargetApp();
  const script = `
    tell application "System Events"
      repeat ${oldText.length} times
        key code 51
      end repeat
    end tell
  `;
  try {
    await runAppleScript(script);
  } catch (err) {
    console.error('[PASTE] backspace failed:', err.message);
  }
  await new Promise((r) => setTimeout(r, 100));
  await pasteText(newText);
}

module.exports = { pasteText, replaceLastText, saveTargetApp, activateTargetApp };
