import { describe, expect, it } from 'vitest';

import { countWords, markdownToPlainText, renderMarkdown } from '@/lib/sanitize';

/**
 * The XSS boundary.
 *
 * Note bodies are user-authored markdown rendered with `dangerouslySetInnerHTML`
 * in `NoteCard`, so everything that reaches the DOM passes through
 * `renderMarkdown()` first. These tests are the contract for that function: if
 * one of them fails, a note can execute script in another session.
 */

describe('renderMarkdown — hostile input', () => {
  it('strips script tags', () => {
    const html = renderMarkdown('سلام <script>alert(1)</script> دنیا');

    expect(html).not.toContain('<script');
    expect(html).not.toContain('alert(1)');
    expect(html).toContain('سلام');
  });

  it('drops event-handler attributes', () => {
    const html = renderMarkdown('<p onclick="alert(1)" onmouseover="alert(2)">متن</p>');

    expect(html).not.toContain('onclick');
    expect(html).not.toContain('onmouseover');
    expect(html).toContain('متن');
  });

  it('refuses javascript: URLs in markdown links', () => {
    // The classic markdown XSS: the tag is allowed, the scheme is not.
    const html = renderMarkdown('[کلیک کنید](javascript:alert(1))');

    expect(html.toLowerCase()).not.toContain('javascript:');
  });

  it('refuses data: URLs, which can carry HTML', () => {
    const html = renderMarkdown(
      '[بزن](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)',
    );

    expect(html.toLowerCase()).not.toContain('data:text/html');
  });

  it('removes tags outside the allow-list', () => {
    const html = renderMarkdown(
      '<img src=x onerror="alert(1)"><iframe src="https://evil.test"></iframe><object data="x"></object>',
    );

    expect(html).not.toContain('<img');
    expect(html).not.toContain('<iframe');
    expect(html).not.toContain('<object');
  });

  it('strips style attributes, which can be used to overlay the UI', () => {
    const html = renderMarkdown('<p style="position:fixed;inset:0;z-index:999">پوشاننده</p>');
    expect(html).not.toContain('position:fixed');
  });
});

describe('renderMarkdown — legitimate content', () => {
  it('keeps the formatting a note actually uses', () => {
    const html = renderMarkdown('# عنوان\n\n**پررنگ** و *کج*\n\n- یک\n- دو');

    expect(html).toContain('<h1');
    expect(html).toContain('<strong>');
    expect(html).toContain('<em>');
    expect(html).toContain('<li>');
    expect(html).toContain('یک');
  });

  it('hardens outbound links', () => {
    const html = renderMarkdown('[کایزن](https://kayzen.app)');

    expect(html).toContain('href="https://kayzen.app"');
    // Without `noopener`, the opened page can navigate this one via window.opener.
    expect(html).toContain('rel="noopener noreferrer nofollow"');
    expect(html).toContain('target="_blank"');
  });

  it('keeps task-list checkboxes display-only', () => {
    const html = renderMarkdown('- [x] انجام شد\n- [ ] مانده');

    if (html.includes('<input')) {
      expect(html).toContain('disabled');
    }
  });

  it('returns an empty string for blank input rather than stray markup', () => {
    expect(renderMarkdown('')).toBe('');
    expect(renderMarkdown('   \n  ')).toBe('');
  });
});

describe('plain-text helpers', () => {
  it('strips markdown syntax for previews', () => {
    const plain = markdownToPlainText('# عنوان\n\n**متن** با [پیوند](https://kayzen.app) و `کد`');

    expect(plain).not.toContain('#');
    expect(plain).not.toContain('**');
    expect(plain).not.toContain('https://kayzen.app');
    expect(plain).toContain('پیوند');
  });

  it('counts words, not markdown tokens', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('یک دو سه')).toBe(3);
    expect(countWords('# عنوان\n\n**یک** دو')).toBe(3);
  });
});
