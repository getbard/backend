import { BigQuery } from '@google-cloud/bigquery';
// import fs from 'fs';

const config = {};

// Comment this out to do local development with BigQuery
// const credentials = JSON.parse(fs.readFileSync(`${__dirname}/../../service-account.json`, 'utf8'));
// const config = {
//   ...config,
//   credentials,
//   projectId: 'bard-stage',
// }

export default process.env.NODE_ENV === 'development' ?  undefined : new BigQuery(config);