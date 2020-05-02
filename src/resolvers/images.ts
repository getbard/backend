import { AuthenticationError } from 'apollo-server';
import { storage } from 'firebase-admin';
import cuid from 'cuid';
import ImgixClient from 'imgix-core-js';
import * as Sentry from '@sentry/node';

import { Context } from '../types';
import { UploadImageInput, UploadImagePayload } from './../generated/graphql';

const uploadImage = async (
  _: null,
  { input }: { input: UploadImageInput },
  context: Context
): Promise<UploadImagePayload> => {
  if (!context.userId) {
    throw new AuthenticationError('Not authenticated');
  }

  // Initialize Imgix
  const imgix = new ImgixClient({
    domain: process.env.IMGIX_DOMAIN || '',
    // Disabling secure tokens for now, otherwise we have to
    // generate all our image URLs on the server
    // secureURLToken: process.env.IMGIX_SECURE_URL_TOKEN,
  });

  // Initialize GCP Cloud Storage
  const storeageClient = storage();
  const bucket = storeageClient.bucket(process.env.IMAGE_BUCKET_NAME);
  const fileName = `${cuid()}-${input.name}`;
  const file = bucket.file(fileName);

  const base64EncodedImageString = input.content.replace(/^data:image\/\w+;base64,/, '');
  const imageBuffer = Buffer.from(base64EncodedImageString, 'base64');

  try {
    await file.save(imageBuffer, {
      metadata: {
        contentType: input.type,
      },
    });
  } catch (error) {
    console.error('Failed to upload image to Cloud Store:', error);
    Sentry.captureException(error);
  }
  
  const url = imgix.buildURL(fileName);

  return { url };
}

export default {
  Query: {},
  Mutation: {
    uploadImage,
  },
};
