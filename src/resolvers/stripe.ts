import { AuthenticationError, ApolloError, UserInputError } from 'apollo-server';
import Stripe from 'stripe';

import { getUserById } from './users';

import { Context } from '../types';
import {
  StripeSession,
  ConnectStripeAccountInput,
  ConnectStripeAccountPayload,
  CreateStripeSessionInput,
  CreateStripeSessionPayload,
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

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2020-03-02',
    typescript: true,
  });

  try {
    const plan = await stripe.plans.create({
      amount: formatAmountForStripe(10, 'usd'),
      currency: 'usd',
      interval: 'month',
      product: { name: 'Monthly Support' },
    }, {
      stripeAccount: stripeUserId,
    });

    await context.db.doc(`users/${userId}`).set({
      stripePlanId: plan.id,
    }, { merge: true });
  } catch (error) {
    console.log('Failed to create default plan:', error.message);
  }
}

const stripeSession = async (
  _: null,
  args: { id: string },
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
  );

  return {
    id: args.id,
    // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
    // @ts-ignore
    status: checkoutSession?.payment_intent?.status,
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

  if (context?.userId !== input.userId) {
    throw new AuthenticationError('Not authorized');
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2020-03-02',
    typescript: true,
  });

  try {
    const response = await stripe.oauth.token({
      // eslint-disable-next-line @typescript-eslint/camelcase
      grant_type: 'authorization_code',
      code: input.authCode,
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
    console.log('Failed to connect Stripe account:', error.message);
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

  const stripeUser = await getUserById(input.userId, context);

  if (!stripeUser) {
    throw new UserInputError('User not found');
  }
  
  const connectedStripeAccountId = stripeUser?.stripeUserId || '';

  if (!connectStripeAccount) {
    console.error('Failed to create a Stripe session, Stripe account not found on user:', stripeUser.id);
    throw new ApolloError('Could not find Stripe account for user');
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2020-03-02',
    typescript: true,
  });

  const applicationFee = +(input.amount * 0.10).toFixed(2);

  /* eslint-disable @typescript-eslint/camelcase */
  const params: Stripe.Checkout.SessionCreateParams = {
    submit_type: 'donate',
    payment_method_types: ['card'],
    line_items: [{
      name: 'One-Time Support',
      amount: formatAmountForStripe(input.amount, 'usd'),
      currency: 'usd',
      quantity: 1,
    }],
    payment_intent_data: {
      application_fee_amount: formatAmountForStripe(applicationFee, 'usd'),
      transfer_data: {
        destination: connectedStripeAccountId,
      },
    },
    success_url: `${input.redirectUrl}?sessionId={CHECKOUT_SESSION_ID}`,
    cancel_url: `${input.redirectUrl}`,
  }
  /* eslint-enable @typescript-eslint/camelcase */

  const checkoutSession: Stripe.Checkout.Session = await stripe.checkout.sessions.create(params);

  return checkoutSession;
}

export default {
  Query: {
    stripeSession,
  },
  Mutation: {
    connectStripeAccount,
    createStripeSession,
  },
}