import { firestore } from 'firebase-admin';

export interface Context {
  db: firestore.Firestore;
  userId: string | null;
}
