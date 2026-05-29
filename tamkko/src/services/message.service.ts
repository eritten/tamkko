import mongoose, { Types } from 'mongoose';
import { Message, IMessageDoc } from '@models/Message';
import { MessageReaction } from '@models/MessageReaction';
import { User } from '@models/User';
import { VIPMembership } from '@models/VIPMembership';
import { ApiError } from '@utils/apiError';
import { sendNotification } from '@services/notifications.service';
import redis from '@config/redis';

const SENDER_SELECT = 'username profile.displayName profile.avatarUrl';
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

interface ConversationEntry {
  otherUserId: unknown;
  user: { _id: unknown; username: string; displayName: string; avatarUrl: string };
  lastMessage: { content: string; createdAt: Date };
  unreadCount: number;
  isOnline: boolean;
}

interface PaginatedMessages {
  messages: Record<string, unknown>[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

interface DeletedMessageRouting {
  messageId: string;
  messageType: 'direct' | 'vip_room';
  recipient?: Types.ObjectId;
  room?: Types.ObjectId;
}

interface ReactionResult {
  reactions: { emoji: string; count: number }[];
  messageType: 'direct' | 'vip_room';
  recipient?: Types.ObjectId;
  room?: Types.ObjectId;
}

async function checkUserOnline(userId: string): Promise<boolean> {
  const result = await redis.get(`online:${userId}`);
  return result === '1';
}

export const messageService = {
  async sendDirectMessage(senderId: string, recipientId: string, content: string): Promise<IMessageDoc> {
    if (senderId === recipientId) throw new ApiError(400, 'You cannot message yourself');

    const recipient = await User.findOne({ _id: recipientId, isDeleted: false }).select('username profile.displayName').lean();
    if (!recipient) throw new ApiError(404, 'Recipient not found');

    const sender = await User.findById(senderId).select('username profile.displayName').lean();
    const senderName = sender?.profile?.displayName || sender?.username || 'Someone';

    const message = await Message.create({ sender: senderId, recipient: recipientId, messageType: 'direct', content });

    await sendNotification(recipientId, {
      type: 'new_dm',
      title: 'New message',
      body: `You have a new message from ${senderName}`,
      data: { senderId, messageId: message._id.toString() },
    });

    return message.populate('sender', SENDER_SELECT);
  },

  async sendMediaMessage(
    senderId: string,
    recipientId: string,
    mediaUrl: string,
    mediaType: 'image' | 'video' | 'audio',
    content?: string
  ): Promise<IMessageDoc> {
    if (senderId === recipientId) throw new ApiError(400, 'You cannot message yourself');

    const recipient = await User.findOne({ _id: recipientId, isDeleted: false }).select('_id').lean();
    if (!recipient) throw new ApiError(404, 'Recipient not found');

    const message = await Message.create({
      sender: senderId,
      recipient: recipientId,
      messageType: 'direct',
      content: content || '',
      mediaUrl,
      mediaType,
    });

    return message.populate('sender', SENDER_SELECT);
  },

  async editMessage(messageId: string, userId: string, newContent: string): Promise<IMessageDoc> {
    const message = await Message.findOne({ _id: messageId, isDeleted: false });
    if (!message) throw new ApiError(404, 'Message not found');
    if (message.sender.toString() !== userId) throw new ApiError(403, 'You can only edit your own messages');
    if (Date.now() - message.createdAt.getTime() > FIFTEEN_MINUTES_MS) {
      throw new ApiError(400, 'Messages cannot be edited after 15 minutes');
    }

    message.content = newContent;
    message.isEdited = true;
    message.editedAt = new Date();
    await message.save();

    return message.populate('sender', SENDER_SELECT);
  },

  async deleteMessage(messageId: string, userId: string, userRole: string): Promise<DeletedMessageRouting> {
    const message = await Message.findOne({ _id: messageId, isDeleted: false });
    if (!message) throw new ApiError(404, 'Message not found');

    const isOwner = message.sender.toString() === userId;
    const isPrivileged = userRole === 'admin' || userRole === 'moderator';
    if (!isOwner && !isPrivileged) throw new ApiError(403, 'You do not have permission to delete this message');

    message.isDeleted = true;
    message.deletedAt = new Date();
    message.content = 'This message was deleted';
    await message.save();

    return {
      messageId: message._id.toString(),
      messageType: message.messageType,
      recipient: message.recipient,
      room: message.room,
    };
  },

  async getDirectMessages(userId: string, otherUserId: string, page: number, limit: number): Promise<PaginatedMessages> {
    const skip = (page - 1) * limit;
    const filter = {
      messageType: 'direct' as const,
      isDeleted: false,
      $or: [
        { sender: userId, recipient: otherUserId },
        { sender: otherUserId, recipient: userId },
      ],
    };

    const [messages, total] = await Promise.all([
      Message.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('sender', SENDER_SELECT).lean(),
      Message.countDocuments(filter),
    ]);

    return { messages, total, page, limit, hasMore: skip + messages.length < total };
  },

  async markMessagesAsRead(userId: string, otherUserId: string): Promise<void> {
    await Message.updateMany(
      { sender: otherUserId, recipient: userId, isRead: false, messageType: 'direct' },
      { isRead: true }
    );
  },

  async getConversations(userId: string): Promise<ConversationEntry[]> {
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const conversations = await Message.aggregate<Omit<ConversationEntry, 'isOnline'>>([
      {
        $match: {
          messageType: 'direct',
          isDeleted: false,
          $or: [{ sender: userObjectId }, { recipient: userObjectId }],
        },
      },
      {
        $addFields: {
          otherUser: { $cond: [{ $eq: ['$sender', userObjectId] }, '$recipient', '$sender'] },
          isUnread: {
            $cond: [
              { $and: [{ $eq: ['$recipient', userObjectId] }, { $eq: ['$isRead', false] }] },
              1,
              0,
            ],
          },
        },
      },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$otherUser',
          lastMessageContent: { $first: '$content' },
          lastMessageTime: { $first: '$createdAt' },
          unreadCount: { $sum: '$isUnread' },
        },
      },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
      {
        $project: {
          _id: 0,
          otherUserId: '$_id',
          user: {
            _id: '$user._id',
            username: '$user.username',
            displayName: '$user.profile.displayName',
            avatarUrl: '$user.profile.avatarUrl',
          },
          lastMessage: { content: '$lastMessageContent', createdAt: '$lastMessageTime' },
          unreadCount: 1,
        },
      },
      { $sort: { 'lastMessage.createdAt': -1 } },
    ]);

    return Promise.all(
      conversations.map(async (conv) => ({
        ...conv,
        isOnline: await checkUserOnline(String(conv.otherUserId)),
      }))
    );
  },

  async sendVipRoomMessage(senderId: string, roomId: string, content: string): Promise<IMessageDoc> {
    const membership = await VIPMembership.findOne({ user: senderId, vipRoom: roomId, status: 'active', isDeleted: false });
    if (!membership) throw new ApiError(403, 'You must be an active member of this VIP room to send messages');

    const message = await Message.create({ sender: senderId, room: roomId, messageType: 'vip_room', content });
    return message.populate('sender', SENDER_SELECT);
  },

  async getVipRoomMessages(userId: string, roomId: string, page: number, limit: number): Promise<PaginatedMessages> {
    const membership = await VIPMembership.findOne({ user: userId, vipRoom: roomId, status: 'active', isDeleted: false });
    if (!membership) throw new ApiError(403, 'You must be an active member of this VIP room to view messages');

    const skip = (page - 1) * limit;
    const filter = { room: roomId, messageType: 'vip_room' as const, isDeleted: false };

    const [messages, total] = await Promise.all([
      Message.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('sender', SENDER_SELECT).lean(),
      Message.countDocuments(filter),
    ]);

    return { messages, total, page, limit, hasMore: skip + messages.length < total };
  },

  async isUserOnline(userId: string): Promise<boolean> {
    return checkUserOnline(userId);
  },

  async toggleMessageReaction(messageId: string, userId: string, emoji: string): Promise<ReactionResult> {
    const message = await Message.findOne({ _id: messageId, isDeleted: false }).lean();
    if (!message) throw new ApiError(404, 'Message not found');

    const existing = await MessageReaction.findOne({ message: messageId, user: userId });

    if (existing) {
      if (existing.emoji === emoji) {
        await existing.deleteOne();
      } else {
        existing.emoji = emoji;
        await existing.save();
      }
    } else {
      await MessageReaction.create({ message: messageId, user: userId, emoji });
    }

    const reactions = await MessageReaction.aggregate<{ emoji: string; count: number }>([
      { $match: { message: new mongoose.Types.ObjectId(messageId) } },
      { $group: { _id: '$emoji', count: { $sum: 1 } } },
      { $project: { _id: 0, emoji: '$_id', count: 1 } },
    ]);

    return { reactions, messageType: message.messageType, recipient: message.recipient, room: message.room };
  },
};
