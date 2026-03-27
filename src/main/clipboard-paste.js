const { clipboard } = require('electron');
const { execFile } = require('child_process');

/**
 * Simulate Cmd+V using macOS CGEvent API (via Python/Quartz).
 * This is the same low-level approach used by vvrite — posts keyboard events
 * directly to the system event queue without involving System Events or osascript.
 */
function simulateCmdV() {
  return new Promise((resolve, reject) => {
    execFile('python3', ['-c', `
from Quartz import CGEventCreateKeyboardEvent, CGEventPost, CGEventSetFlags, kCGHIDEventTap, kCGEventFlagMaskCommand
import time
down = CGEventCreateKeyboardEvent(None, 0x09, True)
CGEventSetFlags(down, kCGEventFlagMaskCommand)
CGEventPost(kCGHIDEventTap, down)
time.sleep(0.05)
up = CGEventCreateKeyboardEvent(None, 0x09, False)
CGEventSetFlags(up, kCGEventFlagMaskCommand)
CGEventPost(kCGHIDEventTap, up)
`], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * Simulate Delete key N times using CGEvent API.
 */
function simulateBackspace(count) {
  return new Promise((resolve, reject) => {
    execFile('python3', ['-c', `
from Quartz import CGEventCreateKeyboardEvent, CGEventPost, kCGHIDEventTap
import time
for _ in range(${count}):
    down = CGEventCreateKeyboardEvent(None, 0x33, True)
    CGEventPost(kCGHIDEventTap, down)
    up = CGEventCreateKeyboardEvent(None, 0x33, False)
    CGEventPost(kCGHIDEventTap, up)
    time.sleep(0.02)
`], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// ── Target app tracking ───────────────────────────────────────────────
let _savedAppName = null;

async function saveTargetApp() {
  try {
    _savedAppName = await new Promise((resolve, reject) => {
      execFile('osascript', ['-e',
        'tell application "System Events" to get name of first application process whose frontmost is true'
      ], (err, stdout) => err ? reject(err) : resolve(stdout.trim()));
    });
  } catch {
    _savedAppName = null;
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
    await simulateCmdV();
  } catch (err) {
    console.error('Paste failed:', err.message);
  }
}

// ── Backspace + replace ───────────────────────────────────────────────
async function replaceLastText(oldText, newText) {
  try {
    await simulateBackspace(oldText.length);
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
    // Simulate Cmd+C using CGEvent
    await new Promise((resolve, reject) => {
      execFile('python3', ['-c', `
from Quartz import CGEventCreateKeyboardEvent, CGEventPost, CGEventSetFlags, kCGHIDEventTap, kCGEventFlagMaskCommand
import time
down = CGEventCreateKeyboardEvent(None, 0x08, True)
CGEventSetFlags(down, kCGEventFlagMaskCommand)
CGEventPost(kCGHIDEventTap, down)
time.sleep(0.05)
up = CGEventCreateKeyboardEvent(None, 0x08, False)
CGEventSetFlags(up, kCGEventFlagMaskCommand)
CGEventPost(kCGHIDEventTap, up)
`], (err) => err ? reject(err) : resolve());
    });
    await new Promise((r) => setTimeout(r, 150));
    const selected = clipboard.readText();
    clipboard.writeText(saved || '');
    if (selected && selected !== saved) return selected;
  } catch {}
  clipboard.writeText(saved || '');
  return null;
}

module.exports = { pasteText, replaceLastText, saveTargetApp, getSelectedText, getTargetAppName };
