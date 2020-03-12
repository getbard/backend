import { Firestore } from '@google-cloud/firestore';

export interface Context {
  db: Firestore;
}

export interface Article {
  title: string;
  subtitle: string;
  content: string;
  headerImageURL: string;
  authorId: string;
  categories: Array<string>;
  comments: Array<string>;
  likes: number;
  wordLength: number;
}