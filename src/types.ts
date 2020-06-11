import { firestore, app } from 'firebase-admin';
import { BigQuery } from '@google-cloud/bigquery';
import stream from 'getstream';

export interface Context {
  db: firestore.Firestore;
  bigQuery?: BigQuery;
  userId: string | null;
  stream: stream.StreamClient;
  firebase: app.App;
}

export type Activity = {
  context: Context;
  verb: string;
  objectType: string;
  objectId: string;
  to?: string[];
  custom?: { [key: string]: any };
}