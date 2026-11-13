import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  FilterKnownKnowledgeBaseRequest,
  FilterKnownKnowledgeBaseResponse,
  KnowledgeBase,
  SearchKnowledgeBaseRequest,
  SearchKnowledgeBaseResponse,
} from '../../domain/knowledge-base/knowledge-base';

interface Article {
  id: string;
  title: string;
  content: string;
  titleTerms: string[];
  contentTerms: string[];
}

export interface MarkdownKnowledgeBaseParams {
  /** Folder of `*.md` files with `id` and `title` in a front matter block. */
  directory: string;
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'you', 'your', 'how', 'can', 'with', 'are', 'was',
  'what', 'this', 'that', 'not', 'have', 'from',
]);
const TITLE_WEIGHT = 3;
const EXCERPT_LENGTH = 240;

/** Keyword search over local markdown articles: term counts, the title weighted higher. */
export class MarkdownKnowledgeBase implements KnowledgeBase {
  private readonly articles: Article[];

  constructor(p: MarkdownKnowledgeBaseParams) {
    this.articles = readdirSync(p.directory)
      .filter((file) => file.endsWith('.md'))
      .sort()
      .map((file) => this.parse(readFileSync(join(p.directory, file), 'utf8')));
  }

  async search(req: SearchKnowledgeBaseRequest): Promise<SearchKnowledgeBaseResponse> {
    const queryTerms = [...new Set(this.terms(req.query))];
    const ranked = this.articles
      .map((article) => ({ article, score: this.score(article, queryTerms) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || a.article.id.localeCompare(b.article.id))
      .slice(0, req.limit);
    return {
      articles: ranked.map(({ article }) => ({
        id: article.id,
        title: article.title,
        excerpt: article.content.slice(0, EXCERPT_LENGTH),
      })),
    };
  }

  async filterKnown(req: FilterKnownKnowledgeBaseRequest): Promise<FilterKnownKnowledgeBaseResponse> {
    const known = new Set(this.articles.map((article) => article.id));
    return { ids: req.ids.filter((id) => known.has(id)) };
  }

  private score(article: Article, queryTerms: string[]): number {
    let score = 0;
    for (const term of queryTerms) {
      score += TITLE_WEIGHT * article.titleTerms.filter((t) => t === term).length;
      score += article.contentTerms.filter((t) => t === term).length;
    }
    return score;
  }

  private parse(source: string): Article {
    const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(source);
    if (!match) throw new Error('Knowledge-base article without a front matter block');
    const meta = new Map(
      (match[1] ?? '').split('\n').map((line) => {
        const [key = '', ...rest] = line.split(':');
        return [key.trim(), rest.join(':').trim()];
      }),
    );
    const title = meta.get('title') ?? '';
    const content = (match[2] ?? '').trim().replace(/\s+/g, ' ');
    return {
      id: meta.get('id') ?? '',
      title,
      content,
      titleTerms: this.terms(title),
      contentTerms: this.terms(content),
    };
  }

  /** Lower-case words without stop words, with a light suffix stemming (tracking → track). */
  private terms(text: string): string[] {
    return (text.toLowerCase().match(/[a-z0-9]+/g) ?? [])
      .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
      .map((word) => this.stem(word));
  }

  private stem(word: string): string {
    if (word.endsWith('ing') && word.length > 5) return word.slice(0, -3);
    if (word.endsWith('ed') && word.length > 4) return word.slice(0, -2);
    if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) return word.slice(0, -1);
    return word;
  }
}
