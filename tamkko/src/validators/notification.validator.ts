import { z } from 'zod';

export const registerPushTokenSchema = z.object({
  body: z.object({
    expoPushToken: z.string().startsWith('ExponentPushToken['),
    device_type: z.enum(['ios', 'android']).optional(),
    device_model: z.string().optional(),
    app_version: z.string().optional(),
  }),
});
