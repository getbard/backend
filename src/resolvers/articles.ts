import { Context, Article } from '../types';

export default async (_: null, args: null, context: Context): Promise<Article[]> => {
  const articles = await context.db.collection('articles').get();
  return articles.docs.map(article => article.data()) as Article[];
};