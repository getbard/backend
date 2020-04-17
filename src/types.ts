import { firestore, auth } from 'firebase-admin';
import stream from 'getstream';

export interface Context {
  db: firestore.Firestore;
  userId: string | null;
  stream: stream.StreamClient;
  auth: auth.Auth;
}
