/* ── Edit popup renderer ── */

const editor = document.getElementById('editor');
const badge = document.getElementById('badge');
const btnCancel = document.getElementById('btn-cancel');
const btnConfirm = document.getElementById('btn-confirm');

let originalText = '';

// ── Receive text from main process ────────────────────────────────────
window.api.onEditLoad((text) => {
  originalText = text || '';
  editor.value = originalText;
  badge.textContent = '';
  badge.className = 'badge';
  // Select all for easy replacement
  editor.focus();
  editor.select();
});

// ── Confirm ───────────────────────────────────────────────────────────
function confirm() {
  const corrected = editor.value.trim();
  if (!corrected) return cancel();

  window.api.sendEditResult({
    original: originalText,
    corrected: corrected,
    changed: originalText !== corrected,
  });
}

// ── Cancel ────────────────────────────────────────────────────────────
function cancel() {
  window.api.sendEditResult(null);
}

// ── Button handlers ───────────────────────────────────────────────────
btnConfirm.addEventListener('click', confirm);
btnCancel.addEventListener('click', cancel);

// ── Keyboard shortcuts ────────────────────────────────────────────────
editor.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    confirm();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    cancel();
  }
});

// ── Show diff hint while editing ──────────────────────────────────────
editor.addEventListener('input', () => {
  const current = editor.value.trim();
  if (current === originalText) {
    badge.textContent = '';
    badge.className = 'badge';
  } else {
    badge.textContent = 'modified';
    badge.className = 'badge';
  }
});
