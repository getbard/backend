import { AuthenticationError, UserInputError } from 'apollo-server';

import { getUserById } from './users';

import { Context } from '../types';
import {
  FollowUserInput,
  FollowUserPayload,
  UnfollowUserInput,
  UnfollowUserPayload,
} from './../generated/graphql';

const followUser = async (
  _: null,
  { input }: { input: FollowUserInput },
  context: Context
): Promise<FollowUserPayload> => {
  if (!context.userId) {
    throw new AuthenticationError('Not authenticated');
  }

  const user = await getUserById(context.userId, context);
  const userToFollow = await getUserById(input.userId, context);
  if (!userToFollow) {
    throw new UserInputError('User not found');
  }

  await context.db.doc(`users/${context.userId}`).set({
    followingIds: [
      ...user?.followingIds || [],
      userToFollow.id
    ],
  }, { merge: true });

  await context.db.doc(`users/${userToFollow.id}`).set({
    followerIds: [
      ...userToFollow?.followerIds || [],
      context.userId
    ],
  }, { merge: true });

  return { userId: userToFollow.id };
}

const unfollowUser = async (
  _: null,
  { input }: { input: UnfollowUserInput },
  context: Context
): Promise<UnfollowUserPayload> => { 
  if (!context.userId) {
    throw new AuthenticationError('Not authenticated');
  }

  const user = await getUserById(context.userId, context);
  const userToUnfollow = await getUserById(input.userId, context);
  if (!userToUnfollow) {
    throw new UserInputError('User not found');
  }

  await context.db.doc(`users/${context.userId}`).set({
    followingIds: user?.followingIds?.filter(following => following !== userToUnfollow.id),
  }, { merge: true });

  await context.db.doc(`users/${userToUnfollow.id}`).set({
    followerIds: userToUnfollow.followerIds?.filter(follower => follower !== context.userId),
  }, { merge: true });

  return { userId: userToUnfollow.id };
}

export default {
  Mutation: {
    followUser,
    unfollowUser,
  },
}
