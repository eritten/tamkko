import africastalking from 'africastalking';
import { Queue, Worker, Job } from 'bullmq';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { Resend } from 'resend';
import redis from '@config/redis';
import { env } from '@config/env';
import { User } from '@models/User';

export interface NotificationJobData {
  userId: string;
  title: string;
  body: string;
  type: string;
  data?: Record<string, unknown>;
}

export const notificationQueue = new Queue<NotificationJobData>('notifications', {
  connection: redis,
});

const expo = new Expo(env.EXPO_ACCESS_TOKEN ? { accessToken: env.EXPO_ACCESS_TOKEN } : undefined);
const resend = new Resend(env.SENDGRID_API_KEY);

const getSmsClient = () => {
  if (!env.AFRICAS_TALKING_API_KEY || !env.AFRICAS_TALKING_USERNAME) return null;

  return africastalking({
    apiKey: env.AFRICAS_TALKING_API_KEY,
    username: env.AFRICAS_TALKING_USERNAME,
  }).SMS;
};

const sendPushNotification = async (job: Job<NotificationJobData>) => {
  const user = await User.findById(job.data.userId);
  if (!user?.expoPushToken || !Expo.isExpoPushToken(user.expoPushToken)) return;

  const message: ExpoPushMessage = {
    to: user.expoPushToken,
    title: job.data.title,
    body: job.data.body,
    data: {
      type: job.data.type,
      ...(job.data.data || {}),
    },
  };

  await expo.sendPushNotificationsAsync([message]);
};

const sendEmailNotification = async (job: Job<NotificationJobData>) => {
  const user = await User.findById(job.data.userId);
  if (!user?.email) return;

  await resend.emails.send({
    from: 'onboarding@resend.dev',
    to: user.email,
    subject: job.data.title,
    html: `<p>${job.data.body}</p>`,
  });
};

const sendSmsNotification = async (job: Job<NotificationJobData>) => {
  const sms = getSmsClient();
  if (!sms) return;

  const user = await User.findById(job.data.userId);
  if (!user?.phone) return;

  await sms.send({
    to: user.phone,
    from: env.AFRICAS_TALKING_USERNAME || 'Tamkko',
    message: job.data.body,
  });
};

let notificationWorker: Worker<NotificationJobData> | null = null;

export const startNotificationWorker = () => {
  if (notificationWorker) return notificationWorker;

  notificationWorker = new Worker<NotificationJobData>(
    'notifications',
    async (job) => {
      try {
        if (job.name === 'push') {
          await sendPushNotification(job);
        } else if (job.name === 'email') {
          await sendEmailNotification(job);
        } else if (job.name === 'sms') {
          await sendSmsNotification(job);
        }
      } catch (error) {
        console.error(`Notification job ${job.name} failed:`, error);
        throw error;
      }
    },
    { connection: redis }
  );

  notificationWorker.on('failed', (job, error) => {
    console.error(`Notification job ${job?.id || 'unknown'} failed:`, error);
  });

  notificationWorker.on('error', (error) => {
    console.error('Notification worker error:', error);
  });

  return notificationWorker;
};
