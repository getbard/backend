import { AuthenticationError, ApolloError, UserInputError } from 'apollo-server';
import Stripe from 'stripe';

import { addActivity } from '../lib/stream';
import { getUserByStripeId, getUserById } from './users';
import { followUser } from './follows';

import { Context } from '../types';
import {
  Subscription,
  User,
  CreateSubscriptionInput,
  CreateSubscriptionPayload,
  CancelSubscriptionInput,
  CancelSubscriptionPayload,
} from '../generated/graphql';

export const getSubscriptionWithStripeData = async (
  subscription: Subscription,
  context: Context,
): Promise<Subscription> => {
  const author = await getUserById(subscription.authorId, context) as User;
  if (!author) {
    console.error('Failed to get Stripe subscription, user not found with ID:', subscription.authorId);
    throw new ApolloError('User not found');
  }
  if (!author.stripeUserId) {
    console.error('Failed to get Stripe subscription, user has no Stripe ID:', subscription.authorId);
    throw new ApolloError('Invalid user');
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2020-03-02',
    typescript: true,
  });

  try {
    const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId, {
      stripeAccount: author.stripeUserId,
    });

    return {
      ...subscription,
      status: stripeSubscription.status,
      currentPeriodEnd: stripeSubscription.current_period_end,
      cancelAt: stripeSubscription.cancel_at,
      plan: stripeSubscription.plan,
    } as Subscription;
  } catch (error) {
    console.error('Failed to get subscription:', error.message);
  }

  return subscription;
}

const subscription = async (
  _: null,
  args: { id: string },
  context: Context,
): Promise<Subscription | null> => {
  const subscriptionDoc = await context.db.doc(`subscriptions/${args.id}`).get();
  const subscription = subscriptionDoc.data() as Subscription | undefined;

  return subscription ? {
    id: subscriptionDoc.id,
    ...subscription,
  } : null;
}

export const createSubscription = async (
  _: null,
  { input }: { input: CreateSubscriptionInput },
  context: Context,
): Promise<CreateSubscriptionPayload> => {
  if (!context.userId) {
    throw new AuthenticationError('Not authenticated');
  }

  const author = await getUserByStripeId(input.stripeUserId, context);
  if (!author) {
    console.error('Failed to create a Stripe subscription, user not found with Stripe ID:', input.stripeUserId);
    throw new ApolloError('Could not find Stripe account for user');
  }

  const subscriptions = await context.db.collection('subscriptions')
    .where('userId', '==', context.userId)
    .where('authorId', '==', author.id)
    .where('deletedAt', '==', null)
    .get();
  const existingSubscriptions = subscriptions.docs
    .map(subscription => ({ id: subscription.id, ...subscription.data() }));

  // Return early if a sub already exists for the user/author and is active
  if (existingSubscriptions.length) {
    return existingSubscriptions[0] as CreateSubscriptionPayload;
  }

  const subscriptionRef = await context.db.collection('subscriptions').add({
    ...input,
    userId: context.userId,
    authorId: author.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  });
  const subscriptionDoc = await context.db.doc(`subscriptions/${subscriptionRef.id}`).get();

  followUser(null, { input: { userId: author.id } }, context);
  addActivity({
    context,
    verb: 'subscribed',
    objectType: 'subscription',
    objectId: author.id,
  });

  return { id: subscriptionDoc.id, ...subscriptionDoc.data() } as CreateSubscriptionPayload;
}

const cancelSubscription = async (
  _: null,
  { input }: { input: CancelSubscriptionInput },
  context: Context,
): Promise<CancelSubscriptionPayload> => {
  if (!context.userId) {
    throw new AuthenticationError('Not authenticated');
  }

  const subscriptionDoc = await context.db.doc(`subscriptions/${input.id}`).get();
  const subscription = { id: subscriptionDoc.id, ...subscriptionDoc.data() } as Subscription;
  const author = await getUserById(subscription.authorId, context);

  if (!subscription) {
    throw new UserInputError('Subscription not found');
  }

  if (context?.userId !== subscription.userId) {
    throw new AuthenticationError('Not authorized');
  }

  if (!author?.stripeUserId) {
    console.error('Failed to cancel subscription, subscription author does not have an associated Stripe account:', subscription);
    throw new ApolloError('Author does not have an associated Stripe account');
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2020-03-02',
    typescript: true,
  });

  try {
    await stripe.subscriptions.del(subscription.stripeSubscriptionId, {
      stripeAccount: author?.stripeUserId,
    });
  } catch (error) {
    console.error('Failed to delete Stripe subscription:', error.message);
    throw new ApolloError('Failed to cancel subscription');
  }

  const deleted = {
    ...subscription,
    deletedAt: new Date().toISOString()
  };

  await context.db
    .doc(`subscriptions/${subscription.id}`)
    .set(deleted, { merge: true });

  return deleted as CancelSubscriptionPayload;
}

const author = async (
  parent: Subscription,
  _: null,
  context: Context,
): Promise<User | null> => {
  const user = await getUserById(parent.authorId, context);
  return user;
}

export default {
  Query: {
    subscription,
  },
  Mutation: {
    createSubscription,
    cancelSubscription,
  },
  Subscription: {
    author,
  }
}