import { Firestore } from '@google-cloud/firestore';

let config = {};

if (process.env.NODE_ENV !== 'development') {
  config = {
    ...config,
    projectId: process.env.PROJECT_ID,
  }
}

const db = new Firestore(config);

if (process.env.NODE_ENV === 'development') {
  db.settings({
    host: `${process.env.DB_HOST}:${process.env.DB_PORT}`,
    ssl: false
  })
}

export default db;