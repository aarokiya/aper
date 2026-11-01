import katex from 'katex';

/**
 * Typeset TeX inside an HTML string with KaTeX, using the artifact's MathJax
 * delimiters (`$…$`, `\(…\)` inline; `$$…$$` display). Text inside pre, code,
 * script, style, and textarea is left alone, and a formula never spans tags,
 * matching MathJax's behaviour on the original artifact. Pure string → string,
 * so server and client renders are identical.
 */
const IGNORED_TAGS: Record<string, true> = {
  pre: true,
  code: true,
  script: true,
  style: true,
  textarea: true,
};

const MATH_PATTERN =
  /\$\$([\s\S]+?)\$\$|\\\(([\s\S]+?)\\\)|\$((?:\\\$|[^$])+?)\$/g;

const ENTITIES: Record<string, string> = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
  '&amp;': '&',
};

function typesetText(text: string) {
  if (!text.includes('$') && !text.includes('\\(')) return text;
  return text.replace(
    MATH_PATTERN,
    (match, display?: string, paren?: string, inline?: string) => {
      const tex = (display ?? paren ?? inline ?? '').replace(
        /&(?:lt|gt|quot|#39|nbsp|amp);/g,
        (entity) => ENTITIES[entity],
      );
      try {
        return katex.renderToString(tex, {
          displayMode: display !== undefined,
          throwOnError: false,
          strict: 'ignore',
        });
      } catch {
        return match;
      }
    },
  );
}

export function renderMathInHtml(html: string) {
  if (!html || (!html.includes('$') && !html.includes('\\('))) return html;
  let skipDepth = 0;
  return html
    .split(/(<[^>]+>)/)
    .map((part) => {
      if (part.startsWith('<')) {
        const name = part.match(/^<\/?\s*([a-zA-Z0-9-]+)/)?.[1]?.toLowerCase();
        if (name && IGNORED_TAGS[name]) {
          if (part.startsWith('</')) skipDepth = Math.max(0, skipDepth - 1);
          else if (!part.endsWith('/>')) skipDepth += 1;
        }
        return part;
      }
      return skipDepth ? part : typesetText(part);
    })
    .join('');
}
