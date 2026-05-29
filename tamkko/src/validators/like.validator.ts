import { z } from 'zod';

export const toggleLikeSchema = z.object({
  body: z.object({
    type: z.enum(['like', 'dislike']),
  }),
});
