import { Fragment, type ReactNode } from 'react';
import { cx } from '@/lib/cx';

// Rendu Markdown minimal et sûr (aucun HTML injecté) pour les textes édités
// dans l'admin : paragraphes, titres ## / ###, listes « - », **gras**,
// *italique*, [liens](https://…).

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)\s]+)\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const key = `${keyPrefix}-${index++}`;
    if (match[2]) nodes.push(<strong key={key} className="font-semibold text-chalk">{match[2]}</strong>);
    else if (match[3]) nodes.push(<em key={key}>{match[3]}</em>);
    else if (match[4] && match[5]) {
      const href = match[5];
      const safe = /^(https?:\/\/|\/|mailto:|tel:|#)/.test(href);
      nodes.push(
        safe ? (
          <a key={key} href={href} className="text-race-400 underline underline-offset-4 hover:text-chalk" {...(href.startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {})}>
            {match[4]}
          </a>
        ) : (
          <Fragment key={key}>{match[4]}</Fragment>
        ),
      );
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function Markdown({ source, className }: { source: string; className?: string }) {
  const blocks = source.replace(/\r\n/g, '\n').split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className={cx('flex max-w-[68ch] flex-col gap-4 text-asphalt-200', className)}>
      {blocks.map((block, i) => {
        const key = `b${i}`;
        if (block.startsWith('### ')) return <h3 key={key} className="mt-4 text-display-sm font-bold uppercase text-chalk">{renderInline(block.slice(4), key)}</h3>;
        if (block.startsWith('## ')) return <h2 key={key} className="mt-6 text-display-md font-bold uppercase text-chalk">{renderInline(block.slice(3), key)}</h2>;
        const lines = block.split('\n');
        if (lines.every((l) => /^\s*[-*] /.test(l))) {
          return (
            <ul key={key} className="flex list-none flex-col gap-2">
              {lines.map((l, j) => (
                <li key={j} className="flex gap-3">
                  <span aria-hidden className="mt-2.5 h-0.5 w-3 shrink-0 bg-race-400" />
                  <span>{renderInline(l.replace(/^\s*[-*] /, ''), `${key}-${j}`)}</span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={key}>
            {lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {renderInline(l, `${key}-${j}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
