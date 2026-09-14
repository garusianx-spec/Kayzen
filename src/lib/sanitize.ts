import DOMPurify from 'dompurify';
import { marked } from 'marked';

/**
 * Markdown → sanitised HTML.
 *
 * Note bodies and 365-library reflections are user-authored markdown rendered
 * with `dangerouslySetInnerHTML`, which makes this the XSS boundary of the app.
 * Sanitisation happens on *render*, not on write: stored content stays intact,
 * and a future improvement to the allow-list retroactively protects old rows.
 *
 * Works on both sides of the render — DOMPurify uses the real DOM in the
 * browser and a lightweight server pass during SSR.
 */

const ALLOWED_TAGS = [
  'p',
  'br',
  'hr',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'del',
  'mark',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'blockquote',
  'code',
  'pre',
  'a',
  'span',
  'div',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'input', // task-list checkboxes, forced disabled below
];

const ALLOWED_ATTRIBUTES = [
  'href',
  'title',
  'target',
  'rel',
  'dir',
  'class',
  'type',
  'checked',
  'disabled',
];

marked.setOptions({ gfm: true, breaks: true });

let hookInstalled = false;

function installHooks(): void {
  if (hookInstalled || typeof window === 'undefined') return;

  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.nodeName === 'A') {
      // External links must not be able to reach back through `window.opener`.
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer nofollow');
    }

    if (node.nodeName === 'INPUT') {
      // GFM task lists are display-only here; an editable checkbox inside
      // rendered markdown would be a confusing, unbacked control.
      node.setAttribute('disabled', 'disabled');
    }
  });

  hookInstalled = true;
}

/**
 * Server-side fallback.
 *
 * DOMPurify needs a DOM; rather than pull in `jsdom` at runtime, SSR escapes the
 * markup entirely. The client re-renders and hydrates the properly sanitised
 * rich version, so the only cost is a single frame of plain text.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderMarkdown(markdown: string): string {
  if (!markdown.trim()) return '';

  if (typeof window === 'undefined') {
    return `<p dir="rtl">${escapeHtml(markdown)}</p>`;
  }

  installHooks();
  const rawHtml = marked.parse(markdown, { async: false });

  return DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ALLOWED_ATTRIBUTES,
    ALLOW_DATA_ATTR: false,
    // `javascript:` and `data:` URIs in hrefs are the classic markdown XSS.
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|#|\/)/i,
  });
}

/** Strips markdown to plain text for previews, search and word counts. */
export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^[#>\-*+]\s+/gm, '')
    .replace(/[*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function countWords(markdown: string): number {
  const plain = markdownToPlainText(markdown);
  return plain ? plain.split(/\s+/).length : 0;
}
