/**
 * User-typed text (my cards) → safe HTML. Everything is escaped; the only
 * markup is ```fenced code``` → `<pre><code>`, `inline code` → `<code>`, and
 * newlines → `<br>` outside code.
 */
const escapeHtml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

function renderProse(text: string) {
  return escapeHtml(text)
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\r?\n/g, '<br>');
}

export function renderUserText(text: string): string {
  const fence = /```([\w+#-]*)[^\n`]*\r?\n?([\s\S]*?)```/g;
  let html = '';
  let last = 0;
  for (const match of text.matchAll(fence)) {
    const start = match.index;
    // A fence on its own line: the newlines around it are part of the block.
    html += renderProse(text.slice(last, start).replace(/\r?\n$/, ''));
    const lang = match[1].toLowerCase();
    const code = escapeHtml(match[2].replace(/\r?\n$/, ''));
    html += lang
      ? `<pre><code class="language-${lang}">${code}</code></pre>`
      : `<pre><code>${code}</code></pre>`;
    last = start + match[0].length;
    if (text.startsWith('\r\n', last)) last += 2;
    else if (text.startsWith('\n', last)) last += 1;
  }
  return html + renderProse(text.slice(last));
}
