/**
 * Shared article renderer for /methodology pages. Server component; markdown
 * comes straight from docs/THRESHER-METHODOLOGY.md via lib/methodology.ts.
 */
import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from './methodology.module.css';

export function MethodologyArticle({
  kicker,
  title,
  markdown,
  children,
}: {
  kicker: string;
  title: string;
  markdown: string;
  children?: ReactNode;
}) {
  return (
    <article className={styles.article}>
      <p className="kicker">{kicker}</p>
      <h1 className={styles.title}>{title}</h1>
      <div className={styles.markdown}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
      </div>
      {children}
    </article>
  );
}
