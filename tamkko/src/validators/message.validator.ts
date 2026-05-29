import { z } from 'zod';

export const sendMessageSchema = z.object({
  body: z.object({
    content: z.string().min(1).max(1000),
  }),
});

export const editMessageSchema = z.object({
  body: z.object({
    content: z.string().min(1).max(1000),
  }),
});

export const sendMediaMessageSchema = z.object({
  body: z.object({
    mediaUrl: z.string().url(),
    mediaType: z.enum(['image', 'video', 'audio']),
    content: z.string().max(1000).optional(),
  }),
});

export const reactionSchema = z.object({
  body: z.object({
    emoji: z.string().min(1).max(10),
  }),
});

export const pageSchema = z.object({
  query: z.object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(50).default(20),
  }),
});
