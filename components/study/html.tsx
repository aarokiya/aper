import { renderMathInHtml } from '@/lib/study/math';

/**
 * Renders Study Hub content HTML (lecture notes, questions, solutions, cards,
 * guides) exactly as the artifact injects it. When the course typesets math,
 * TeX is rendered with KaTeX; results are memoized per HTML string so
 * re-renders (checking an answer, flipping a card) stay cheap.
 */
const typeset = new Map<string, string>();
const TYPESET_LIMIT = 600;

function withMath(html: string) {
  let out = typeset.get(html);
  if (out === undefined) {
    out = renderMathInHtml(html);
    if (typeset.size >= TYPESET_LIMIT)
      typeset.delete(typeset.keys().next().value as string);
    typeset.set(html, out);
  }
  return out;
}

export function Html({
  html,
  math,
  as: Tag = 'div',
  className,
}: {
  html: string;
  math: boolean;
  as?: 'div' | 'span' | 'li' | 'td';
  className?: string;
}) {
  return (
    <Tag
      className={className}
      dangerouslySetInnerHTML={{ __html: math ? withMath(html) : html }}
    />
  );
}
