import { Firestore } from '@google-cloud/firestore';

export interface Context {
  db: Firestore;
}
