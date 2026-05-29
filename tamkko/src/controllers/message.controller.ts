import { Response } from 'express';
import { AuthRequest } from '@middleware/auth';
import { catchAsync } from '@utils/catchAsync';
import { messageService } from '@services/message.service';
import { io } from '@/index';

export const sendDirectMessage = catchAsync(async (req: AuthRequest, res: Response) => {
  const senderId = req.user!.id;
  const { userId: recipientId } = req.params;
  const { content } = req.body as { content: string };

  const message = await messageService.sendDirectMessage(senderId, recipientId, content);
  io.to(`user_${recipientId}`).emit('new_dm', { message });
  res.status(201).json({ status: 'success', data: { message } });
});

export const sendMediaMessage = catchAsync(async (req: AuthRequest, res: Response) => {
  const senderId = req.user!.id;
  const { userId: recipientId } = req.params;
  const { mediaUrl, mediaType, content } = req.body as {
    mediaUrl: string;
    mediaType: 'image' | 'video' | 'audio';
    content?: string;
  };

  const message = await messageService.sendMediaMessage(senderId, recipientId, mediaUrl, mediaType, content);
  io.to(`user_${recipientId}`).emit('new_dm', { message });
  res.status(201).json({ status: 'success', data: { message } });
});

export const editMessage = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { messageId } = req.params;
  const { content } = req.body as { content: string };

  const message = await messageService.editMessage(messageId, userId, content);

  if (message.messageType === 'direct' && message.recipient) {
    io.to(`user_${message.recipient.toString()}`).emit('message_edited', { message });
    io.to(`user_${userId}`).emit('message_edited', { message });
  } else if (message.messageType === 'vip_room' && message.room) {
    io.to(`vip_room_${message.room.toString()}`).emit('message_edited', { message });
  }

  res.json({ status: 'success', data: { message } });
});

export const deleteMessage = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { messageId } = req.params;

  const result = await messageService.deleteMessage(messageId, userId, req.user!.role);

  if (result.messageType === 'direct' && result.recipient) {
    io.to(`user_${result.recipient.toString()}`).emit('message_deleted', { messageId });
    io.to(`user_${userId}`).emit('message_deleted', { messageId });
  } else if (result.messageType === 'vip_room' && result.room) {
    io.to(`vip_room_${result.room.toString()}`).emit('message_deleted', { messageId });
  }

  res.json({ status: 'success', data: { message: 'Message deleted' } });
});

export const getDirectMessages = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { userId: otherUserId } = req.params;
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 20);

  const data = await messageService.getDirectMessages(userId, otherUserId, page, limit);
  res.json({ status: 'success', data });
});

export const markAsRead = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { userId: otherUserId } = req.params;

  await messageService.markMessagesAsRead(userId, otherUserId);
  io.to(`user_${otherUserId}`).emit('dm_read', { readBy: userId });
  res.json({ status: 'success', data: { message: 'Messages marked as read' } });
});

export const getConversations = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const data = await messageService.getConversations(userId);
  res.json({ status: 'success', data: { conversations: data } });
});

export const getVipRoomMessages = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { roomId } = req.params;
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 20);

  const data = await messageService.getVipRoomMessages(userId, roomId, page, limit);
  res.json({ status: 'success', data });
});

export const toggleMessageReaction = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { messageId } = req.params;
  const { emoji } = req.body as { emoji: string };

  const result = await messageService.toggleMessageReaction(messageId, userId, emoji);

  const payload = { messageId, reactions: result.reactions };
  if (result.messageType === 'direct' && result.recipient) {
    io.to(`user_${result.recipient.toString()}`).emit('message_reaction_updated', payload);
    io.to(`user_${userId}`).emit('message_reaction_updated', payload);
  } else if (result.messageType === 'vip_room' && result.room) {
    io.to(`vip_room_${result.room.toString()}`).emit('message_reaction_updated', payload);
  }

  res.json({ status: 'success', data: { reactions: result.reactions } });
});
