export interface Module {
  id: string;
  name: string;
  shortName: string;
  category: string;
  isRecitationOnly: boolean;
  sortOrder: number;
  totalArticles: number;
}

export interface Article {
  id: string;
  moduleId: string;
  title: string;
  subtitle: string | null;
  author: string;
  dynasty: string;
  genre: string;
  isGaoKao72: boolean;
  recitationScope: string;
  fullContent: string;
  paragraphs: string[];
  translation: string | null;
  annotations: string[];
  sortOrder: number;
  totalSegments: number;
  totalCards: number;
}

export interface ArticleMeta {
  id: string;
  moduleId: string;
  book: string;
  title: string;
  subtitle: string | null;
  author: string;
  dynasty: string;
  genre: string;
  isGaoKao72: boolean;
  recitationScope: string;
  charCount: number;
  netLength: number;
  paragraphCount: number;
  sortOrder: number;
  totalSegments: number;
  totalCards: number;
  generatedCardCount: number;
}
