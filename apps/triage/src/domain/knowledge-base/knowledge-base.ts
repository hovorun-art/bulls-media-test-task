export interface ArticleMatch {
  id: string;
  title: string;
  excerpt: string;
}

export interface SearchKnowledgeBaseRequest {
  query: string;
  limit: number;
}

export interface SearchKnowledgeBaseResponse {
  articles: ArticleMatch[];
}

export interface FilterKnownKnowledgeBaseRequest {
  ids: string[];
}

export interface FilterKnownKnowledgeBaseResponse {
  ids: string[];
}

/** The shop's policy articles the agent may cite. */
export interface KnowledgeBase {
  search(req: SearchKnowledgeBaseRequest): Promise<SearchKnowledgeBaseResponse>;
  /** Keeps only the ids of articles that exist, in the given order. */
  filterKnown(req: FilterKnownKnowledgeBaseRequest): Promise<FilterKnownKnowledgeBaseResponse>;
}

export const KNOWLEDGE_BASE = Symbol('KnowledgeBase');
