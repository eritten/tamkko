import { z } from 'zod';

export const addCommentSchema = z.object({
  body: z.object({
    content: z.string().min(1).max(500),
    parentCommentId: z.string().optional(),
  }),
});

export const pageSchema = z.object({
  query: z.object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(50).default(20),
  }),
});
