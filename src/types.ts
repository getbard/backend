import { firestore } from 'firebase-admin';

export interface Context {
  db: firestore.Firestore;
  userID: string | null;
}
