import { Fragment, type ReactNode } from 'react';

/** Renders **bold** spans without ever injecting HTML. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>,
  );
}

const BULLET = /^\s*[-•*]\s+/;
const NUMBERED = /^\s*(?:\d+|[٠-٩]+)[.)]\s+/;

/** Paragraphs, bullet lists ("- ") and numbered lists ("1. "), separated by blank lines. */
export function RichText({ text }: { text: string }) {
  const blocks = text.replace(/\r\n/g, '\n').split(/\n{2,}/).map((b) => b.split('\n').filter((l) => l.trim()));
  return (
    <div className="rich-text">
      {blocks.map((lines, i) => {
        if (!lines.length) return null;
        if (lines.every((l) => BULLET.test(l)))
          return (
            <ul key={i}>
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(BULLET, ''))}</li>
              ))}
            </ul>
          );
        if (lines.every((l) => NUMBERED.test(l)))
          return (
            <ol key={i}>
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(NUMBERED, ''))}</li>
              ))}
            </ol>
          );
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {inline(l)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
