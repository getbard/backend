import { AuthenticationError, UserInputError } from 'apollo-server';
import { downloadUnsplashPhoto } from './unsplashPhotos';

import { Context } from '../types';
import {
  ProfileSection,
  CreateProfileSectionInput,
  CreateProfileSectionPayload,
  UpdateProfileSectionInput,
  UpdateProfileSectionPayload,
  DeleteProfileSectionInput,
  DeleteProfileSectionPayload,
} from '../generated/graphql';

const profileSection = async (
  _: null,
  args: { id: string },
  context: Context,
): Promise<ProfileSection> => {
  const sectionDoc = await context.db.doc(`sections/${args.id}`).get();
  const section = sectionDoc.data() as ProfileSection | undefined;

  if (!section) {
    throw new UserInputError('Article not found');
  }

  return {
    id: sectionDoc.id,
    ...section,
  };
}

const profileSections = async (
  _: null,
  args: { userId: string },
  context: Context,
): Promise<ProfileSection[]> => {
  const sectionsDocs = await context.db
    .collection('sections')
    .where('deletedAt', '==', null)
    .where('userId', '==', args.userId)
    .get();

  const sections = sectionsDocs.docs.map(section => ({
    id: section.id,
    ...section.data(),
  })) as ProfileSection[];

  return sections;
}

const createProfileSection = async (
  _: null,
  { input }: { input: CreateProfileSectionInput },
  context: Context,
): Promise<CreateProfileSectionPayload> => {
  if (!context.userId) {
    throw new AuthenticationError('Not authenticated');
  }

  const defaultSection = {
    userId: context.userId,
    title: '',
    content: '',
    headerImage: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  };

  const section: CreateProfileSectionInput = {
    ...defaultSection,
    ...input,
  };

  // Send the download event to Unsplash
  if (input.headerImage) {
    downloadUnsplashPhoto(input?.headerImage?.downloadUrl || '');
  }

  const sectionRef = await context.db.collection('sections').add(section);
  const sectionDoc = await context.db.doc(`sections/${sectionRef.id}`).get();

  return { id: sectionDoc.id } as CreateProfileSectionPayload;
}

const updateProfileSection = async (
  _: null,
  { input }: { input: UpdateProfileSectionInput },
  context: Context,
): Promise<UpdateProfileSectionPayload> => {
  if (!context.userId) {
    throw new AuthenticationError('Not authenticated');
  }

  let sectionDoc = await context.db.doc(`sections/${input.id}`).get();

  if (!sectionDoc) {
    throw new UserInputError('Section not found');
  }

  const oldSection = { ...sectionDoc.data() };

  if (context.userId !== oldSection.userId) {
    throw new AuthenticationError('Not authorized');
  }

  const section = {
    id: input.id,
    ...oldSection,
    ...input,
    updatedAt: new Date().toISOString(),
  } as CreateProfileSectionInput;

  // Send the download event to Unsplash
  if (input.headerImage && oldSection?.headerImage?.url !== input.headerImage.url) {
    downloadUnsplashPhoto(input?.headerImage?.downloadUrl || '');
  }

  await context.db.doc(`sections/${input.id}`).set(section, { merge: true });
  sectionDoc = await context.db.doc(`sections/${input.id}`).get();

  return { id: sectionDoc.id } as UpdateProfileSectionPayload;
}

const deleteProfileSection = async (
  _: null,
  { input }: { input: DeleteProfileSectionInput },
  context: Context,
): Promise<DeleteProfileSectionPayload> => {
  if (!context.userId) {
    throw new AuthenticationError('Not authenticated');
  }

  const sectionDoc = await context.db.doc(`sections/${input.id}`).get();
  const section = sectionDoc.data() as ProfileSection | undefined;

  if (!section || !section.userId) {
    throw new UserInputError('Section not found');
  }

  if (context.userId !== section.userId) {
    throw new AuthenticationError('Not authorized');
  }

  const deletedSection = {
    id: sectionDoc.id,
    ...sectionDoc.data(),
    ...input,
    deletedAt: new Date().toISOString(),
  };

  await context.db.doc(`sections/${deletedSection.id}`).set(deletedSection, { merge: true });

  return deletedSection as DeleteProfileSectionPayload;
}

export default {
  Query: {
    profileSection,
    profileSections,
  },
  Mutation: {
    createProfileSection,
    updateProfileSection,
    deleteProfileSection,
  },
}
