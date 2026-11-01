import sanitizeHtml from 'sanitize-html';

export function sanitizeAcademicHtml(html: string | null | undefined) {
  return sanitizeHtml(html ?? '', {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      'img',
      'table',
      'thead',
      'tbody',
      'tfoot',
      'tr',
      'th',
      'td',
      'pre',
      'code',
      'math',
      'mrow',
      'mi',
      'mn',
      'mo',
    ]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      '*': ['class', 'title'],
      a: ['href', 'name', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', {
        rel: 'noopener noreferrer',
        target: '_blank',
      }),
    },
  });
}

export function htmlToText(html: string | null | undefined) {
  return sanitizeHtml(html ?? '', { allowedTags: [], allowedAttributes: {} })
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function sanitizeFilename(value: string) {
  const base = value
    .normalize('NFKC')
    .replace(/[\p{Cc}/\\:]/gu, '-')
    .replace(/\.\.+/g, '.')
    .replace(/^\.+/, '')
    .trim();
  return (base || 'untitled').slice(0, 180);
}
