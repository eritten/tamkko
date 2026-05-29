import { Types } from 'mongoose';
import { VIPMembership } from '@/models/VIPMembership';
import { VIPRoom } from '@/models/vipRoom.model';
import { VIPPost } from '@/models/VIPPost';
import { PaymentProvider, Transaction, TransactionStatus, TransactionType } from '@/models/Transaction';
import { User } from '@/models/User';
import * as paystackService from '@/services/paystack.service';
import { sendNotification } from '@/services/notifications.service';
import { ApiError } from '@/utils/apiError';
import { env } from '@/config/env';
import { v4 as uuidv4 } from 'uuid';

const toObjectId = (id: string) => id as unknown as Types.ObjectId;
type ActorRole = 'user' | 'creator' | 'moderator' | 'admin';

const isPrivilegedRole = (role?: ActorRole) => role === 'admin' || role === 'moderator';

const isSameId = (left: unknown, right: unknown) => String(left) === String(right);

const ensureActiveMember = async (roomId: string, userId: string) => {
  const membership = await VIPMembership.findOne({
    vipRoom: roomId,
    user: userId,
    status: 'active',
    isDeleted: false,
  });
  if (!membership) throw new ApiError(403, 'Not a member of this room');
  return membership;
};

const ensureRoomModerator = async (roomId: string, actorId: string, actorRole?: ActorRole) => {
  const room = await VIPRoom.findOne({ _id: roomId, isDeleted: false });
  if (!room) throw new ApiError(404, 'VIP room not found.');
  if (!isSameId(room.creator, actorId) && !isPrivilegedRole(actorRole)) {
    throw new ApiError(403, 'You cannot manage members in this VIP room.');
  }
  return room;
};

export const createRoom = async (creatorId: string, data: any) => {
  return VIPRoom.create({
    creator: toObjectId(creatorId),
    name: data.name,
    description: data.description,
    tier: data.tier ?? 'gold',
    monthlyFee: data.monthlyFee ?? data.monthly_fee ?? data.entryFee ?? 0,
    campusCode: data.campusCode?.toUpperCase(),
  });
};

export const listRooms = async (query: any) => {
  const page = Math.max(Number(query.page ?? 1), 1);
  const limit = Math.min(Math.max(Number(query.limit ?? 20), 1), 100);
  const filter: Record<string, unknown> = { isDeleted: false, isActive: true };
  if (query.tier) filter.tier = query.tier;
  if (query.campusCode) filter.campusCode = String(query.campusCode).toUpperCase();
  if (query.search) filter.name = { $regex: query.search, $options: 'i' };

  const [items, total] = await Promise.all([
    VIPRoom.find(filter)
      .populate('creator', 'username profile.displayName')
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 }),
    VIPRoom.countDocuments(filter),
  ]);

  return { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
};

export const getRoom = async (roomId: string) => {
  const room = await VIPRoom.findOne({ _id: roomId, isDeleted: false }).populate(
    'creator',
    'username profile.displayName'
  );
  if (!room) throw new ApiError(404, 'VIP room not found.');
  return room;
};

export const updateRoom = async (roomId: string, actorId: string, data: any) => {
  const room = await VIPRoom.findOne({ _id: roomId, creator: actorId, isDeleted: false });
  if (!room) throw new ApiError(403, 'You cannot update this VIP room.');
  Object.assign(room, {
    name: data.name ?? room.name,
    description: data.description ?? room.description,
    tier: data.tier ?? room.tier,
    monthlyFee: data.monthlyFee ?? data.monthly_fee ?? room.monthlyFee,
    campusCode: data.campusCode ? data.campusCode.toUpperCase() : room.campusCode,
    isActive: data.isActive ?? room.isActive,
  });
  return room.save();
};

export const deleteRoom = async (roomId: string, actorId: string) => {
  const room = await VIPRoom.findOne({ _id: roomId, creator: actorId, isDeleted: false });
  if (!room) throw new ApiError(403, 'You cannot delete this VIP room.');
  room.isDeleted = true;
  room.isActive = false;
  await room.save();
  return room;
};

export const joinRoom = async (roomId: string, userId: string, data: any) => {
  const room = await getRoom(roomId);
  if (room.bannedUsers?.some((bannedUserId) => isSameId(bannedUserId, userId))) {
    throw new ApiError(403, 'You are banned from this room');
  }
  const existing = await VIPMembership.findOne({ vipRoom: room._id, user: userId, isDeleted: false });
  if (existing?.status === 'active') throw new ApiError(409, 'You are already a member of this VIP room.');

  if (room.monthlyFee > 0) {
    const user = await User.findById(userId);
    if (!user) throw new ApiError(404, 'User not found.');

    const reference = `vip_${uuidv4()}`;
    const transaction = await Transaction.create({
      user: toObjectId(userId),
      type: TransactionType.VIP_SUBSCRIPTION,
      amount: room.monthlyFee,
      currency: data.currency ?? 'GHS',
      status: TransactionStatus.PENDING,
      provider: PaymentProvider.PAYSTACK,
      providerTransactionId: reference,
      vipRoom: room._id,
      metadata: {
        type: 'vip_subscription',
        userId,
        roomId: room._id.toString(),
        autoRenew: Boolean(data.autoRenew),
      },
      description: `VIP subscription for ${room.name}`,
    });

    const paystack = await paystackService.initializeTransaction({
      email: user.email,
      amount: room.monthlyFee,
      reference,
      callbackUrl: `${env.CLIENT_URL}/payments/callback`,
      metadata: {
        type: 'vip_subscription',
        transactionId: transaction._id.toString(),
        userId,
        roomId: room._id.toString(),
        autoRenew: Boolean(data.autoRenew),
      },
    });

    return {
      membership: null,
      transaction,
      payment_reference: paystack.reference,
      authorization_url: paystack.authorizationUrl,
      status: 'pending_payment',
    };
  }

  const endDate = new Date();
  endDate.setMonth(endDate.getMonth() + 1);

  const membership = await VIPMembership.findOneAndUpdate(
    { vipRoom: room._id, user: userId },
    {
      vipRoom: room._id,
      user: toObjectId(userId),
      startDate: new Date(),
      endDate,
      autoRenew: Boolean(data.autoRenew),
      status: 'active',
      isDeleted: false,
    },
    { new: true, upsert: true }
  );

  if (membership.status === 'active') {
    await VIPRoom.updateOne({ _id: room._id }, { $inc: { memberCount: 1 } });
  }

  return membership;
};

export const leaveRoom = async (roomId: string, userId: string) => {
  const membership = await VIPMembership.findOneAndUpdate(
    { vipRoom: roomId, user: userId, isDeleted: false, status: 'active' },
    { status: 'cancelled', isDeleted: true },
    { new: true }
  );
  if (!membership) throw new ApiError(404, 'Active VIP membership not found.');
  await VIPRoom.updateOne({ _id: roomId, memberCount: { $gt: 0 } }, { $inc: { memberCount: -1 } });
  return membership;
};

export const getRoomMembers = async (roomId: string, query: any) => {
  const page = Math.max(Number(query.page ?? 1), 1);
  const limit = Math.min(Math.max(Number(query.limit ?? 50), 1), 100);
  const filter = { vipRoom: roomId, isDeleted: false };
  const [items, total] = await Promise.all([
    VIPMembership.find(filter)
      .populate('user', 'username profile.displayName profile.avatar')
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 }),
    VIPMembership.countDocuments(filter),
  ]);
  return { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
};

export const createPost = async (roomId: string, userId: string, data: { content: string; mediaUrl?: string }) => {
  await ensureActiveMember(roomId, userId);
  const room = await getRoom(roomId);

  const post = await VIPPost.create({
    room: room._id,
    author: toObjectId(userId),
    content: data.content,
    mediaUrl: data.mediaUrl,
  });

  await sendNotification(room.creator.toString(), {
    type: 'vip_new_post',
    title: 'New post in your VIP room',
    body: `New post in your VIP room: ${room.name}`,
    data: { roomId, postId: post._id },
  });

  const { io } = await import('@/index');
  io.to(`vip_room_${roomId}`).emit('vip_post_received', post.toObject());

  return post;
};

export const getRoomPosts = async (roomId: string, userId: string, page = 1, limit = 20) => {
  await ensureActiveMember(roomId, userId);
  const safePage = Math.max(page, 1);
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const filter = { room: roomId, isDeleted: false };

  const [items, total] = await Promise.all([
    VIPPost.find(filter)
      .populate('author', 'username profile.displayName profile.avatarUrl')
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit),
    VIPPost.countDocuments(filter),
  ]);

  return { items, pagination: { page: safePage, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) } };
};

export const deletePost = async (postId: string, actorId: string, actorRole: ActorRole) => {
  const post = await VIPPost.findOne({ _id: postId, isDeleted: false });
  if (!post) throw new ApiError(404, 'VIP post not found.');

  const room = await VIPRoom.findOne({ _id: post.room, isDeleted: false });
  if (!room) throw new ApiError(404, 'VIP room not found.');

  const canDelete = isSameId(post.author, actorId) || isSameId(room.creator, actorId) || isPrivilegedRole(actorRole);
  if (!canDelete) throw new ApiError(403, 'You cannot delete this VIP post.');

  post.isDeleted = true;
  await post.save();
  return { deleted: true, postId: post._id };
};

export const kickMember = async (roomId: string, actorId: string, targetUserId: string, actorRole?: ActorRole) => {
  const room = await ensureRoomModerator(roomId, actorId, actorRole);
  await VIPMembership.findOneAndUpdate(
    { vipRoom: roomId, user: targetUserId, isDeleted: false },
    { isDeleted: true, status: 'cancelled' },
    { new: true }
  );
  await VIPRoom.updateOne({ _id: roomId, memberCount: { $gt: 0 } }, { $inc: { memberCount: -1 } });

  await sendNotification(targetUserId, {
    type: 'vip_removed',
    title: `You have been removed from the VIP room: ${room.name}`,
    body: `You have been removed from the VIP room: ${room.name}`,
    data: { roomId },
  });

  return { message: 'Member removed from VIP room.' };
};

export const banMember = async (roomId: string, actorId: string, targetUserId: string, actorRole?: ActorRole) => {
  const room = await ensureRoomModerator(roomId, actorId, actorRole);
  await kickMember(roomId, actorId, targetUserId, actorRole);
  await VIPRoom.updateOne({ _id: roomId }, { $addToSet: { bannedUsers: toObjectId(targetUserId) } });

  await sendNotification(targetUserId, {
    type: 'vip_banned',
    title: `You have been banned from the VIP room: ${room.name}`,
    body: `You have been banned from the VIP room: ${room.name}`,
    data: { roomId },
  });

  return { message: 'Member banned from VIP room.' };
};

export const processPayment = async (roomId: string, userId: string, data: any) => {
  return joinRoom(roomId, userId, data);
};

export const getRoomRevenue = async (roomId: string) => {
  const result = await Transaction.aggregate([
    { $match: { type: TransactionType.VIP_SUBSCRIPTION, status: TransactionStatus.COMPLETED, vipRoom: toObjectId(roomId) } },
    { $group: { _id: '$currency', total: { $sum: '$amount' }, count: { $sum: 1 } } },
  ]);
  return { roomId, revenue: result };
};

export const createCampusCode = async (data: any) => ({
  code: data.code ?? `VIP-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
  roomId: data.roomId,
  expiresAt: data.expiresAt,
});

export const listCampusCodes = async () => ({ items: [] });

export const getRoomsByCampus = async (campusCode: string) => {
  const rooms = await VIPRoom.find({
    campusCode: campusCode.toUpperCase(),
    isDeleted: false,
    isActive: true,
  }).populate('creator', 'username profile.displayName profile.avatarUrl');

  return { campusCode: campusCode.toUpperCase(), rooms };
};
