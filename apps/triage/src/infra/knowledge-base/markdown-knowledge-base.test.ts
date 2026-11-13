import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MarkdownKnowledgeBase } from './markdown-knowledge-base';

const shopArticles = fileURLToPath(new URL('../../../data/kb', import.meta.url));

/** A knowledge base made of the given files, so each test shows the articles it relies on. */
function aKnowledgeBaseOf(files: Record<string, string>) {
  const directory = mkdtempSync(join(tmpdir(), 'kb-'));
  for (const [name, content] of Object.entries(files)) writeFileSync(join(directory, name), content);
  return new MarkdownKnowledgeBase({ directory });
}

const anArticle = (id: string, title: string, body: string) => `---\nid: ${id}\ntitle: ${title}\n---\n${body}\n`;

describe('MarkdownKnowledgeBase', () => {
  it('Knowledge base search returns matching articles', async () => {
    const knowledgeBase = new MarkdownKnowledgeBase({ directory: shopArticles });

    const { articles } = await knowledgeBase.search({ query: 'refund window', limit: 3 });

    expect(articles.map((article) => article.id)).toContain('refund-policy');
  });

  it('ranks a title match above two content matches', async () => {
    const knowledgeBase = aKnowledgeBaseOf({
      'a.md': anArticle('in-content', 'Other', 'warranty warranty'),
      'b.md': anArticle('in-title', 'Warranty', 'Nothing else.'),
    });

    const { articles } = await knowledgeBase.search({ query: 'warranty', limit: 5 });

    expect(articles.map((article) => article.id)).toEqual(['in-title', 'in-content']);
  });

  it('orders equal scores by id', async () => {
    const knowledgeBase = aKnowledgeBaseOf({
      'z.md': anArticle('beta', 'Lamp', 'x'),
      'y.md': anArticle('alpha', 'Lamp', 'x'),
    });

    const { articles } = await knowledgeBase.search({ query: 'lamp', limit: 5 });

    expect(articles.map((article) => article.id)).toEqual(['alpha', 'beta']);
  });

  it('matches word forms: tracking finds track, refunds finds refund', async () => {
    const knowledgeBase = aKnowledgeBaseOf({ 'a.md': anArticle('a', 'Track a refund', 'x') });

    const { articles } = await knowledgeBase.search({ query: 'tracking refunds', limit: 5 });

    expect(articles.map((article) => article.id)).toEqual(['a']);
  });

  it('returns no articles for a query of stop words and short words only', async () => {
    const knowledgeBase = aKnowledgeBaseOf({ 'a.md': anArticle('a', 'How can you do this', 'The and for to') });

    const { articles } = await knowledgeBase.search({ query: 'how can you do this to the', limit: 5 });

    expect(articles).toEqual([]);
  });

  it('returns the best articles up to the limit', async () => {
    const knowledgeBase = aKnowledgeBaseOf({
      'a.md': anArticle('one-hit', 'x', 'order'),
      'b.md': anArticle('two-hits', 'x', 'order order'),
      'c.md': anArticle('three-hits', 'x', 'order order order'),
    });

    const { articles } = await knowledgeBase.search({ query: 'order', limit: 2 });

    expect(articles.map((article) => article.id)).toEqual(['three-hits', 'two-hits']);
  });

  it('gives an excerpt of the first 240 characters with whitespace collapsed', async () => {
    const knowledgeBase = aKnowledgeBaseOf({ 'a.md': anArticle('a', 'Lamp', `Lamp\n\n  ${'y'.repeat(300)}`) });

    const { articles } = await knowledgeBase.search({ query: 'lamp', limit: 1 });

    expect(articles[0]?.excerpt).toBe(`Lamp ${'y'.repeat(235)}`);
  });

  it('ignores files that are not markdown', async () => {
    const knowledgeBase = aKnowledgeBaseOf({ 'notes.txt': 'lamp', 'a.md': anArticle('a', 'Other', 'x') });

    const { articles } = await knowledgeBase.search({ query: 'lamp', limit: 5 });

    expect(articles).toEqual([]);
  });

  it('refuses an article without a front matter block', () => {
    expect(() => aKnowledgeBaseOf({ 'a.md': 'Just text' })).toThrow('front matter');
  });

  it('keeps only the ids of existing articles, in the given order', async () => {
    const knowledgeBase = new MarkdownKnowledgeBase({ directory: shopArticles });

    const { ids } = await knowledgeBase.filterKnown({ ids: ['warranty', 'free-money', 'refund-policy'] });

    expect(ids).toEqual(['warranty', 'refund-policy']);
  });
});
