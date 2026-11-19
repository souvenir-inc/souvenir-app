---
name: react-markdown-renderer
description: >
  Reference for building a NEW Markdown rendering stack from scratch (react-markdown + remark/rehype + streaming memoization). Use only when the user explicitly asks to build a new renderer or set one up in a different project. Do NOT use for changes to this repo's existing chat/markdown rendering (src/lib/markdown-utils.tsx and related files): work with the existing code and its conventions instead of swapping in this skill's stack.
---

# React Markdown Renderer

Build the same rendering stack used by Claude, ChatGPT, and other AI chat UIs: `react-markdown` + `remark`/`rehype` plugins + custom styled components + streaming-aware block memoization.

---

## Stack Overview

| Layer | Package | Purpose |
|---|---|---|
| Markdown → React | `react-markdown` | Core renderer, safe virtual DOM |
| GFM extensions | `remark-gfm` | Tables, strikethrough, task lists, autolinks |
| Syntax highlighting | `rehype-highlight` or `shiki` | Code block coloring |
| Math | `remark-math` + `rehype-katex` | LaTeX equations |
| HTML passthrough | `rehype-raw` + `rehype-sanitize` | Safe raw HTML in Markdown |
| Streaming optimization | `React.memo` + block splitting | Prevent full re-renders on each token |
| Styling | Tailwind or custom CSS | Typography, spacing, colors |

---

## Install

```bash
npm install react-markdown remark-gfm rehype-highlight rehype-sanitize
# optional extras:
npm install remark-math rehype-katex rehype-raw
```

---

## Basic Setup (non-streaming)

```tsx
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import 'highlight.js/styles/github-dark.css'; // or any hljs theme

// remark-gfm already prefixes footnote ids with `user-content-`; sanitize's default would
// prefix them again, so footnote links point at ids that don't exist. Raw HTML isn't
// rendered (no rehype-raw), so markdown-made ids are the only ones and keep their prefix.
export const sanitize = [rehypeSanitize, { ...defaultSchema, clobberPrefix: '' }] as const;

export function MessageRenderer({ content }: { content: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[sanitize, rehypeHighlight]}
      components={markdownComponents}
    >
      {content}
    </Markdown>
  );
}
```

---

## Custom Components (the "polished" part)

This is what makes it look clean. Override each HTML element:

```tsx
import { Components } from 'react-markdown';

export const markdownComponents: Components = {
  // Headings
  h1: ({ children }) => (
    <h1 className="text-2xl font-bold mt-6 mb-3 tracking-tight">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-xl font-semibold mt-5 mb-2">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-lg font-semibold mt-4 mb-1">{children}</h3>
  ),

  // Paragraphs
  p: ({ children }) => (
    <p className="my-3 leading-7">{children}</p>
  ),

  // Code. react-markdown v9+ passes no `inline` prop: every `code` gets the inline
  // look here, and a fenced block — which arrives as <pre><code> — has it undone by
  // `pre` below. Keep `className`: it carries `language-*` for highlighters.
  code: ({ children, className, ...props }) => (
    <code
      className={`bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-sm font-mono ${className ?? ''}`}
      {...props}
    >
      {children}
    </code>
  ),

  // Code blocks: reset the inline-code styling on the <code> inside.
  pre: ({ children }) => (
    <pre className="bg-zinc-900 text-zinc-100 rounded-lg p-4 overflow-x-auto my-4 text-sm leading-relaxed [&>code]:bg-transparent [&>code]:p-0 [&>code]:rounded-none">
      {children}
    </pre>
  ),

  // Lists
  ul: ({ children }) => (
    <ul className="list-disc list-outside pl-6 my-3 space-y-1">{children}</ul>
  ),
  // `start` keeps a list that begins at 3 numbered from 3.
  ol: ({ start, children }) => (
    <ol start={start} className="list-decimal list-outside pl-6 my-3 space-y-1">{children}</ol>
  ),
  // Pass the rest on: a footnote's <li> carries the id its back-reference points at.
  // (`node` is react-markdown's syntax-tree node, not a DOM attribute.)
  li: ({ node, children, ...props }) => <li {...props} className="leading-7">{children}</li>,

  // Blockquote
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-zinc-300 dark:border-zinc-600 pl-4 italic my-4 text-zinc-600 dark:text-zinc-400">
      {children}
    </blockquote>
  ),

  // Table (remark-gfm)
  table: ({ children }) => (
    <div className="overflow-x-auto my-4">
      <table className="w-full text-sm border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-left font-semibold">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-zinc-200 dark:border-zinc-700 px-3 py-2">{children}</td>
  ),

  // Links
  // The rest passes on: `title` from [text](url "title"), and a footnote reference's id,
  // aria-describedby and data-footnote-* attributes. In-page links (#…, footnotes) stay in
  // the tab; only links that leave the page open a new one.
  a: ({ node, href, children, ...props }) => {
    const external = !href?.startsWith('#');
    return (
      <a {...props} href={href}
         {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
         className="text-blue-600 dark:text-blue-400 underline underline-offset-2 hover:opacity-80">
        {children}
      </a>
    );
  },

  // Horizontal rule
  hr: () => <hr className="my-6 border-zinc-200 dark:border-zinc-700" />,
};
```

---

## Streaming Setup (AI chat)

When streaming token-by-token, naively re-rendering the whole message on every token is expensive. The trick: split into blocks and memoize each one.

```tsx
import { memo, useMemo } from 'react';
import Markdown, { Options } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { sanitize } from './MessageRenderer'; // the footnote-safe sanitize setting above

// Memoized block — only re-renders when content changes. Same plugins as the basic
// renderer above, so streamed code blocks are highlighted and HTML is sanitised too.
const MemoizedMarkdown = memo(
  ({ content, ...props }: { content: string } & Options) => (
    <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[sanitize, rehypeHighlight]} {...props}>{content}</Markdown>
  ),
  (prev, next) => prev.content === next.content
);

// Split into blocks that each parse the same on their own as inside the whole
// document. A plain split on blank lines breaks two things: a fenced code block
// with a blank line inside it, and reference links (`[docs][1]` … `[1]: https://…`),
// whose definition ends up in a different block from the link. So: split on blank
// lines only outside a fence, and give every block the document's definitions.
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const DEFINITION = /^ {0,3}\[[^\]]+\]:\s*\S/;
// A definition's title may sit on the next line on its own: "Title", 'Title' or (Title).
const DEFINITION_TITLE = /^\s*("[^"]*"|'[^']*'|\([^)]*\))\s*$/;

function splitIntoBlocks(text: string): string[] {
  const blocks: string[] = [];
  const definitions: string[] = [];
  let current: string[] = [];
  let fence: string | null = null;
  let afterDefinition = false;
  const flush = () => {
    if (current.some((line) => line.trim())) blocks.push(current.join('\n'));
    current = [];
  };
  for (const line of text.split('\n')) {
    const marker = FENCE.exec(line)?.[1];
    // A title line right after a definition belongs to it, not to the next block.
    if (afterDefinition && DEFINITION_TITLE.test(line)) {
      definitions[definitions.length - 1] += `\n${line}`;
      afterDefinition = false;
      continue;
    }
    afterDefinition = false;
    if (fence) {
      // Only a matching fence of at least the same length closes it, and only with
      // nothing but whitespace after it: a ```js line inside a block is content.
      if (marker && marker[0] === fence[0] && marker.length >= fence.length && !line.trim().slice(marker.length).trim()) fence = null;
      current.push(line);
    } else if (marker) {
      fence = marker;
      current.push(line);
    } else if (DEFINITION.test(line) && current.length === 0) {
      // Only at the start of a block: a definition can't interrupt a paragraph, so a
      // `[x]: …` line inside one is ordinary text and stays where it is.
      definitions.push(line);
      afterDefinition = true;
    } else if (!line.trim()) {
      flush();
    } else {
      current.push(line);
    }
  }
  flush(); // an unclosed fence (still streaming) stays one block
  const defs = definitions.join('\n');
  return defs ? blocks.map((block) => `${block}\n\n${defs}`) : blocks;
}

export function StreamingMessage({
  content,
  isStreaming,
}: {
  content: string;
  isStreaming: boolean;
}) {
  const blocks = useMemo(() => splitIntoBlocks(content), [content]);

  return (
    <div className="prose dark:prose-invert max-w-none">
      {blocks.map((block, i) => (
        <MemoizedMarkdown
          key={i}
          content={block}
          components={markdownComponents}
        />
      ))}
      {isStreaming && (
        <span className="inline-block w-1 h-4 bg-current animate-pulse ml-0.5" />
      )}
    </div>
  );
}
```

---

## Math Support (optional)

```tsx
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

// Add to plugins:
remarkPlugins={[remarkGfm, remarkMath]}
rehypePlugins={[sanitize, rehypeKatex]} // `sanitize` as in the basic setup (footnote-safe)
```

---

## Security Notes

- **Always use `rehype-sanitize`** when rendering user-influenced AI output. It strips `<script>`, `onerror`, `javascript:` URLs, and other vectors.
- If you need raw HTML passthrough, pair `rehype-raw` with `rehype-sanitize` — never use `rehype-raw` alone.
- Never use `dangerouslySetInnerHTML` as a markdown approach; `react-markdown` avoids this by building a virtual DOM instead.

---

## Shiki (alternative to rehype-highlight)

Shiki gives VS Code-quality highlighting but adds ~200KB. Use it when quality matters more than bundle size:

```tsx
import { codeToHtml } from 'shiki';

// Custom code component using Shiki
const ShikiCode = async ({ children, className }: any) => {
  const lang = className?.replace('language-', '') ?? 'text';
  const html = await codeToHtml(String(children), {
    lang,
    theme: 'github-dark',
  });
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
};
```

> Note: Shiki is async — works best with React Server Components (Next.js App Router) or pre-rendering. For client-side streaming, stick with `rehype-highlight`.

---

## Quick-start Checklist

- [ ] Install `react-markdown` + `remark-gfm`
- [ ] Add `rehype-sanitize` (security — don't skip)
- [ ] Add `rehype-highlight` + a highlight.js CSS theme for code blocks
- [ ] Write custom `components` for headings, code, lists, tables
- [ ] For streaming: wrap in `React.memo`, split on `\n\n`, add caret cursor
- [ ] Test with: headers, code blocks, tables, bold/italic, nested lists, links
