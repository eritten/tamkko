import { Notification } from '@models/Notification';
import { User } from '@models/User';
import { notificationQueue } from '@queues/notification.queue';
import { emitNotification } from '@sockets/notification.socket';
import { ApiError } from '@utils/apiError';

interface SendNotificationInput {
  title: string;
  body: string;
  type: string;
  data?: Record<string, unknown>;
}

const EMAIL_NOTIFICATION_TYPES = new Set([
  'payment_received',
  'tip_received',
  'withdrawal_completed',
  'withdrawal_failed',
]);

const SMS_NOTIFICATION_TYPES = new Set(['tip_received', 'withdrawal_completed']);

const notificationCategory = (type: string): 'social' | 'earnings' | 'system' => {
  if (EMAIL_NOTIFICATION_TYPES.has(type) || SMS_NOTIFICATION_TYPES.has(type) || type.includes('payment') || type.includes('withdrawal') || type.includes('tip')) {
    return 'earnings';
  }
  return 'system';
};

export async function sendNotification(userId: string, input: SendNotificationInput) {
  const notification = await Notification.create({
    recipient: userId,
    type: input.type,
    category: notificationCategory(input.type),
    title: input.title,
    message: input.body,
    data: input.data || {},
  });

  const { io } = await import('@/index');
  emitNotification(io, userId, notification.toObject());

  const jobData = {
    userId,
    title: input.title,
    body: input.body,
    type: input.type,
    data: input.data,
  };

  await notificationQueue.add('push', jobData, { removeOnComplete: true, attempts: 3 });

  if (EMAIL_NOTIFICATION_TYPES.has(input.type)) {
    await notificationQueue.add('email', jobData, { removeOnComplete: true, attempts: 3 });
  }

  if (SMS_NOTIFICATION_TYPES.has(input.type)) {
    await notificationQueue.add('sms', jobData, { removeOnComplete: true, attempts: 3 });
  }

  return notification;
}

export async function registerExpoPushToken(userId: string, expoPushToken: string) {
  const user = await User.findByIdAndUpdate(userId, { expoPushToken }, { new: true }).select('-password');
  if (!user) throw new ApiError(404, 'User not found');
  return { expoPushToken: user.expoPushToken };
}

export async function getUserNotifications(userId: string, query: { limit?: number; category?: string; unread_only?: string }) {
  const filter: Record<string, unknown> = { recipient: userId, isDeleted: false };
  if (query.category && query.category !== 'all') filter.category = query.category;
  if (query.unread_only === 'true') filter.isRead = false;

  const notifications = await Notification.find(filter)
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(query.limit || 20), 50));
  const unread_count = await Notification.countDocuments({ recipient: userId, isDeleted: false, isRead: false });

  return { unread_count, notifications, next_cursor: null, has_more: false };
}

export async function getUnreadCount(userId: string) {
  const [social, earnings, system] = await Promise.all([
    Notification.countDocuments({ recipient: userId, category: 'social', isRead: false, isDeleted: false }),
    Notification.countDocuments({ recipient: userId, category: 'earnings', isRead: false, isDeleted: false }),
    Notification.countDocuments({ recipient: userId, category: 'system', isRead: false, isDeleted: false }),
  ]);
  return { unread_count: social + earnings + system, by_category: { social, earnings, system } };
}

export async function markAsRead(userId: string, notificationId: string) {
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, recipient: userId, isDeleted: false },
    { isRead: true },
    { new: true }
  );
  if (!notification) throw new ApiError(404, 'Notification not found');
  const counts = await getUnreadCount(userId);
  return { notification_id: notification._id, is_read: notification.isRead, unread_count: counts.unread_count };
}

export async function markAllAsRead(userId: string, category?: string) {
  const filter: Record<string, unknown> = { recipient: userId, isDeleted: false, isRead: false };
  if (category) filter.category = category;
  const result = await Notification.updateMany(filter, { isRead: true });
  return { marked_count: result.modifiedCount, unread_count: 0 };
}

export async function deleteNotification(userId: string, notificationId: string) {
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, recipient: userId },
    { isDeleted: true },
    { new: true }
  );
  if (!notification) throw new ApiError(404, 'Notification not found');
  return getUnreadCount(userId);
}
