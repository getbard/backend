import { AuthenticationError, ApolloError, UserInputError } from 'apollo-server';
import Stripe from 'stripe';
import * as Sentry from '@sentry/node';

import { getUserById, getUserByStripeId } from './users';
import { createSubscription } from './subscriptions';

import { Context } from '../types';
import {
  StripeSession,
  ConnectStripeAccountInput,
  ConnectStripeAccountPayload,
  CreateStripeSessionInput,
  CreateStripeSessionPayload,
  UpdateStripePlanPriceInput,
  UpdateStripePlanPricePayload,
} from '../generated/graphql';

const formatAmountForStripe = (
  amount: number,
  currency: string
): number => {
  const numberFormat = new Intl.NumberFormat(['en-US'], {
    style: 'currency',
    currency: currency,
    currencyDisplay: 'symbol'
  });

  const parts = numberFormat.formatToParts(amount);

  let zeroDecimalCurrency = true;
  for (const part of parts) {
    if (part.type === 'decimal') {
      zeroDecimalCurrency = false;
    }
  }

  return zeroDecimalCurrency ? amount : Math.round(amount * 100);
}

const createDefaultStripePlan = async ({ userId, stripeUserId, context }: {
  context: Context;
  userId: string;
  stripeUserId: string | undefined;
}): Promise<void> => {
  if (!stripeUserId && !userId) {
    return;
  }

  const user = await getUserById(userId, context);

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2020-03-02',
    typescript: true,
  });

  try {
    const plan = await stripe.plans.create({
      amount: formatAmountForStripe(10, 'usd'),
      currency: 'usd',
      interval: 'month',
      product: { name: `${user?.firstName || 'Author Support'} on Bard` },
    }, {
      stripeAccount: stripeUserId,
    });

    await context.db.doc(`users/${userId}`).set({
      stripePlanId: plan.id,
    }, { merge: true });
  } catch (error) {
    console.error('Failed to create default plan:', error.message);
    Sentry.captureException(error);
  }
}

const stripeSession = async (
  _: null,
  args: { id: string; stripeUserId: string; authorId: string },
  context: Context,
): Promise<StripeSession> => {
  if (!context.userId) {
    throw new AuthenticationError('Not authenticated');
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2020-03-02',
    typescript: true,
  });

  const checkoutSession: Stripe.Checkout.Session = await stripe.checkout.sessions.retrieve(
    args.id,
    { expand: ['payment_intent'] },
    { stripeAccount: args.stripeUserId }
  );

  if (checkoutSession.mode === 'subscription' && checkoutSession?.subscription) {
    try {
      await createSubscription(null, { input: {
        authorId: args.authorId,
        stripeUserId: args.stripeUserId,
        // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
        // @ts-ignore
        stripeSubscriptionId:  checkoutSession.subscription,
      } }, context);
    } catch (error) {
      console.error('Failed to create a Stripe subscription:', error);
      Sentry.captureException(error);
      throw new ApolloError('Failed to create a Stripe subscription');
    }
  }

  // TODO: Resolve type issues here...
  return {
    id: args.id,
    // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
    // @ts-ignore
    status: checkoutSession?.payment_intent?.status,
    // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
    // @ts-ignore
    subscription: checkoutSession?.subscription,
  };
}

const connectStripeAccount = async (
  _: null,
  { input }: { input: ConnectStripeAccountInput },
  context: Context,
): Promise<ConnectStripeAccountPayload> => {
  if (!context.userId) {
    throw new AuthenticationError('Not authenticated');
  }

  if (context.userId !== input.userId) {
    throw new AuthenticationError('Not authorized');
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2020-03-02',
    typescript: true,
  });

  try {
    const response = await stripe.oauth.token({
      /* eslint-disable @typescript-eslint/camelcase */
      grant_type: 'authorization_code',
      code: input.authCode,
      /* eslint-enable @typescript-eslint/camelcase */
    });

    const { stripe_user_id: stripeUserId } = response;

    await context.db.doc(`users/${input.userId}`).set({
      stripeUserId,
    }, { merge: true });

    createDefaultStripePlan({
      context,
      userId: input.userId,
      stripeUserId,
    });

    return { success: true };
  } catch (error) {
    console.error('Failed to connect Stripe account:', error.message);
    Sentry.captureException(error);
    throw new ApolloError(error);
  }
}

const createStripeSession = async (
  _: null,
  { input }: { input: CreateStripeSessionInput },
  context: Context,
): Promise<CreateStripeSessionPayload> => {
  if (!context.userId) {
    throw new AuthenticationError('Not authenticated');
  }

  if (!input.stripeUserId) {
    throw new UserInputError('User not found');
  }

  if (!input.plan && !input.amount) {
    throw new UserInputError('Invalid Stripe plan');
  }

  if (!getUserByStripeId(input.stripeUserId, context)) {
    console.error('Failed to create a Stripe session, user not found with Stripe ID:', input.stripeUserId);
    throw new ApolloError('Could not find Stripe account for user');
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2020-03-02',
    typescript: true,
  });

  /* eslint-disable @typescript-eslint/camelcase */
  const params: Stripe.Checkout.SessionCreateParams = {
    payment_method_types: ['card'],
    success_url: `${input.redirectUrl}?sessionId={CHECKOUT_SESSION_ID}`,
    cancel_url: `${input.redirectUrl}`,
  }

  if (input.amount) {
    params.submit_type = 'donate';

    params.line_items = [{
      name: 'One-Time Support',
      amount: formatAmountForStripe(input.amount, 'usd'),
      currency: 'usd',
      quantity: 1,
    }];

    const applicationFee = +(input.amount * 0.10).toFixed(2);
    params.payment_intent_data = {
      application_fee_amount: formatAmountForStripe(applicationFee, 'usd'),
    };
  }

  if (input.plan) {
    params.subscription_data = {
      items: [{
        plan: input.plan.id,
      }],
      application_fee_percent: 10,
    };
  }
  /* eslint-enable @typescript-eslint/camelcase */

  const checkoutSession: Stripe.Checkout.Session = await stripe.checkout.sessions.create(params, {
    stripeAccount: input.stripeUserId || undefined,
  });

  return checkoutSession;
}

const updateStripePlanPrice = async (
  _: null,
  { input }: { input: UpdateStripePlanPriceInput },
  context: Context,
): Promise<UpdateStripePlanPricePayload | null> => {
  if (!context.userId) {
    throw new AuthenticationError('Not authenticated');
  }

  const user = await getUserById(context.userId, context);

  if (!user) {
    throw new UserInputError('User not found');
  }

  if (!user.stripeUserId) {
    throw new UserInputError(`Invalid Stripe user (${user.id})`);
  }

  if (!user.stripePlanId) {
    throw new UserInputError(`Stripe Plan not found for user ${user.id}`);
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2020-03-02',
    typescript: true,
  });

  const currPlan: Stripe.Plan = await stripe.plans.retrieve(user.stripePlanId, {
    expand: ['product'],
  }, {
    stripeAccount: user.stripeUserId,
  });

  const { product } = currPlan;

  if (!product || typeof product === 'string') {
    console.error(`Valid Stripe Product not found on plan for user (${user.id})`, currPlan);
    throw new UserInputError(`Valid Stripe Product not found for user ${user.id}`);
  }

  try {
    // Create a new plan on Stripe
    const plan = await stripe.plans.create({
      amount: formatAmountForStripe(input.amount, 'usd'),
      currency: 'usd',
      interval: 'month',
      product: product.id,
    }, {
      stripeAccount: user.stripeUserId,
    });

    await stripe.plans.del(currPlan.id, {
      stripeAccount: user.stripeUserId,
    });

    // Update the user with the new plan
    await context.db
      .doc(`users/${context.userId}`)
      .set({ stripePlanId: plan.id }, { merge: true });

    return { id: plan.id };
  }
  catch (error) {
    console.error('Failed to update Stripe Plan Price:', error);
    Sentry.captureException(error);
    throw new UserInputError('Could not update Stripe Plan');
  }
}

export default {
  Query: {
    stripeSession,
  },
  Mutation: {
    connectStripeAccount,
    createStripeSession,
    updateStripePlanPrice,
  },
}