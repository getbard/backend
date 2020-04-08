import { AuthenticationError, UserInputError } from 'apollo-server';

import { Context } from '../types';
import {
  Comment,
  CreateCommentInput,
  CreateCommentPayload,
  UpdateCommentInput,
  UpdateCommentPayload,
  DeleteCommentInput,
  DeleteCommentPayload,
} from '../generated/graphql';

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

export default {
  Query: {},
  Mutation: {
    createComment,
    updateComment,
    deleteComment,
  }
}
