import { AuthenticationError, UserInputError } from 'apollo-server';

import { Context } from '../types';
import {
  Article,
  Collection,
  User,
  CreateCollectionInput,
  CreateCollectionPayload,
  UpdateCollectionInput,
  UpdateCollectionPayload,
  DeleteCollectionInput,
  DeleteCollectionPayload,
} from '../generated/graphql';

import { getUserById } from './users';

const collection = async (
  _: null, 
  { id }: { id: string },
  context: Context,
): Promise<Collection> => {
  const collectionDoc = await context.db.doc(`collections/${id}`).get();
  const collection = collectionDoc.data() as Collection | undefined;

  if (!collection) {
    throw new UserInputError('Collection not found');
  }

  if (!collection.public && context.userId !== collection.userId) {
    throw new AuthenticationError('Not authorized');
  }

  return {
    id: collectionDoc.id,
    ...collection,
  };
}

const createCollection = async(
  _: null,
  { input }: { input: CreateCollectionInput },
  context: Context,
): Promise<CreateCollectionPayload> => {
  if (!context.userId) {
    throw new AuthenticationError('Not authenticated');
  }

  const defaultCollection = {
    userId: context.userId,
    name: '',
    description: '',
    articleIds: [],
    public: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  }

  const collection = {
    ...defaultCollection,
    ...input,
  };

  const collectionRef = await context.db.collection('collections').add(collection);
  const collectionDoc = await context.db.doc(`collections/${collectionRef.id}`).get();

  return { id: collectionDoc.id } as CreateCollectionPayload;
}

const updateCollection = async(
  _: null,
  { input }: { input: UpdateCollectionInput },
  context: Context,
): Promise<UpdateCollectionPayload> => {
  if (!context.userId) {
    throw new AuthenticationError('Not authenticated');
  }

  const collectionDoc = await context.db.doc(`collections/${input.id}`).get();
  const oldCollection = { ...collectionDoc.data() };

  if (!oldCollection) {
    throw new UserInputError('Collection not found');
  }

  if (context.userId !== oldCollection.userId) {
    throw new AuthenticationError('Not authorized');
  }

  const collection = {
    ...input,
    updatedAt: new Date().toISOString(),
  };

  await context.db.doc(`collections/${collection.id}`).set(collection, { merge: true });

  return { id: collectionDoc.id } as UpdateCollectionPayload;
}

const deleteCollection = async(
  _: null,
  { input }: { input: DeleteCollectionInput },
  context: Context,
): Promise<DeleteCollectionPayload> => {
  if (!context.userId) {
    throw new AuthenticationError('Not authenticated');
  }

  const collectionDoc = await context.db.doc(`collections/${input.id}`).get();
  const oldCollection = { ...collectionDoc.data() };

  if (!oldCollection) {
    throw new UserInputError('Collection not found');
  }

  if (context.userId !== oldCollection.userId) {
    throw new AuthenticationError('Not authorized');
  }

  const deleted = {
    ...input,
    deletedAt: new Date().toISOString(),
  };

  await context.db.doc(`collections/${input.id}`).set(deleted, { merge: true });

  return deleted as DeleteCollectionPayload;
}

export const articles = async (
  parent: Collection,
  _: null,
  context: Context,
): Promise<Article[]> => {
  const articles = await context.db
    .collection('articles')
    .where('id', 'in', parent.articleIds)
    .where('deletedAt', '==', null)
    .get();

  return articles.docs
    .map((articleDoc): Article => {
      return {
        id: articleDoc.id,
        ...articleDoc.data()
      } as Article;
    });
}

const user = async (
  parent: Collection,
  _: null,
  context: Context,
): Promise<User | null> => {
  if (!parent.userId) {
    return null;
  }

  return await getUserById(parent.userId, context);
}

export default {
  Query: {
    collection,
  },
  Mutation: {
    createCollection,
    updateCollection,
    deleteCollection,
  },
  Collection: {
    articles,
    user,
  }
}