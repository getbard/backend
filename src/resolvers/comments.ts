import { AuthenticationError, UserInputError } from 'apollo-server';

import { getUserById } from './users';

import { Context } from '../types';
import {
  Comment,
  User,
  CreateCommentInput,
  CreateCommentPayload,
  UpdateCommentInput,
  UpdateCommentPayload,
  DeleteCommentInput,
  DeleteCommentPayload,
} from '../generated/graphql';

const commentsByResourceId = async (
  _: null,
  args: { resourceId: string },
  context: Context,
): Promise<Comment[]> => {
  const comments = await context.db
    .collection('comments')
    .where('resourceId','==', args.resourceId)
    .where('parentId', '==', null)
    .where('deletedAt', '==', null)
    .orderBy('createdAt', 'asc')
    .get();

  return comments.docs.map(comment => ({ id: comment.id, ...comment.data() })) as Comment[];
}

const createComment = async (
  _: null,
  { input }: { input: CreateCommentInput },
  context: Context,
): Promise<CreateCommentPayload> => {
  if (!context.userId) {
    throw new AuthenticationError('Not authenticated');
  }

  const defaultComment = {
    userId: context.userId,
    message: input.message,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
    likes: 0,
    parentId: null,
  };

  const comment = {
    ...defaultComment,
    ...input,
  }

  const commentRef = await context.db.collection('comments').add(comment);
  const commentDoc = await context.db.doc(`comments/${commentRef.id}`).get();

  return { id: commentDoc.id, ...commentDoc.data() } as CreateCommentPayload;
}

const updateComment = async (
  _: null,
  { input }: { input: UpdateCommentInput },
  context: Context,
): Promise<UpdateCommentPayload> => {
  if (!context.userId) {
    throw new AuthenticationError('Not authenticated');
  }

  const commentDoc = await context.db.doc(`comments/${input.id}`).get();
  const comment = commentDoc.data() as Comment | undefined;

  if (!comment) {
    throw new UserInputError('Comment not found');
  }

  if (comment.userId && context?.userId !== comment.userId) {
    throw new AuthenticationError('Not authorized');
  }

  const updatedComment = {
    id: commentDoc.id,
    ...commentDoc.data(),
    ...input,
    updatedAt: new Date().toISOString(),
  };

  await context.db.doc(`comments/${updatedComment.id}`).set(updatedComment, { merge: true });

  return updatedComment as UpdateCommentPayload;
}

const deleteComment = async (
  _: null,
  { input }: { input: DeleteCommentInput },
  context: Context,
): Promise<DeleteCommentPayload> => {
  if (!context.userId) {
    throw new AuthenticationError('Not authenticated');
  }

  const commentDoc = await context.db.doc(`comments/${input.id}`).get();
  const comment = commentDoc.data() as Comment | undefined;

  if (!comment) {
    throw new UserInputError('Comment not found');
  }

  if (comment.userId && context?.userId !== comment.userId) {
    throw new AuthenticationError('Not authorized');
  }

  const deletedComment = {
    id: commentDoc.id,
    ...commentDoc.data(),
    ...input,
    deletedAt: new Date().toISOString(),
  };

  await context.db.doc(`comments/${deletedComment.id}`).set(deletedComment, { merge: true });

  return deletedComment as DeleteCommentPayload;
}

const user = async (
  parent: Comment,
  _: null,
  context: Context,
): Promise<User | null> => {
  return await getUserById(parent.userId, context);
}

const replies = async (
  parent: Comment,
  _: null,
  context: Context,
): Promise<Comment[]> => {
  const comments = await context.db
    .collection('comments')
    .where('parentId', '==', parent.id)
    .where('deletedAt', '==', null)
    .orderBy('createdAt', 'asc')
    .get();

  return comments.docs.map(comment => ({ id: comment.id, ...comment.data() })) as Comment[];
}

export default {
  Query: {
    commentsByResourceId,
  },
  Mutation: {
    createComment,
    updateComment,
    deleteComment,
  },
  Comment: {
    user,
    replies,
  },
}
