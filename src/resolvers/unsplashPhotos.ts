import Unsplash, { toJson } from 'unsplash-js';
import fetch from 'node-fetch';
import { AuthenticationError } from 'apollo-server';

import { Context } from '../types';
import { UnsplashPhoto } from '../generated/graphql';

// Setup Unsplash :(
// eslint-disable-next-line @typescript-eslint/ban-ts-ignore
// @ts-ignore
global.fetch = fetch;
const unsplash = new Unsplash({ accessKey: process.env.UNSPLASH_ACCESS_KEY || '' });

type UnsplashPhotoObject = {
  id: string;
  urls: { [key: string]: string };
  user: { name: string };
}

const unsplashPhoto = async (
  _: null,
  args: { search: string },
  context: Context
): Promise<UnsplashPhoto | null> => {
  if (!context.userId) {
    throw new AuthenticationError('Not authenticated');
  }

  let photos;

  if (args.search) {
    const searchResults = await unsplash.search.photos(args.search, 1, 15, { orientation: 'landscape' }).then(toJson);
    photos = searchResults?.results || [];
  } else {
    photos = await unsplash.photos.listPhotos(1, 15, "latest").then(toJson);
  }

  return photos.map(({ id, urls, user }: UnsplashPhotoObject) => ({
    id,
    urls,
    photographerName: user.name,
  })) as UnsplashPhoto;
}

export default {
  Query: {
    unsplashPhoto,
  },
}