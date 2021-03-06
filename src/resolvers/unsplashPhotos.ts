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
  links: { [key: string]: string };
  user: {
    name: string;
    links: {
      html: string;
    };
  };
}

export const downloadUnsplashPhoto = (downloadUrl: string): void => {
  unsplash.photos.downloadPhoto({ links:
    {
      // eslint-disable-next-line @typescript-eslint/camelcase
      download_location: downloadUrl || '',
    }
  });
}

const unsplashPhoto = async (
  _: null,
  { search }: { search: string },
  context: Context
): Promise<UnsplashPhoto | null> => {
  if (!context.userId) {
    throw new AuthenticationError('Not authenticated');
  }

  const searchResults = await unsplash.search
    .photos(search, 1, 30, { orientation: 'landscape' })
    .then(toJson);
    
  const photos = searchResults?.results || [];

  return photos.map(({ id, urls, user, links }: UnsplashPhotoObject) => ({
    id,
    urls: {
      ...urls,
      // eslint-disable-next-line @typescript-eslint/camelcase
      download_location: links.download_location,
    },
    photographerName: user.name,
    photographerUrl: user.links.html,
  })) as UnsplashPhoto;
}

export default {
  Query: {
    unsplashPhoto,
  },
}