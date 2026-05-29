import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { env } from '@config/env';
import redis from '@config/redis';
import { Follow } from '@models/Follow';
import { registerVipSocketHandlers } from './vip.socket';
import { messageService } from '@services/message.service';

interface SocketTokenPayload {
  id?: string;
  userId?: string;
}

const emitToFollowers = async (io: Server, userId: string, event: string, payload: object) => {
  const follows = await Follow.find({ following: userId }).select('follower').lean();
  for (const f of follows) {
    io.to(`user_${f.follower.toString()}`).emit(event, payload);
  }
};

export const initSockets = (io: Server) => {
  io.on('connection', (socket) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string') { socket.disconnect(true); return; }

    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as SocketTokenPayload;
      const userId = decoded.userId || decoded.id;
      if (!userId) { socket.disconnect(true); return; }

      socket.data.userId = userId;
      socket.join(`user_${userId}`);
      console.log(`Socket connected: ${socket.id} user=${userId}`);

      // Online status
      redis.setex(`online:${userId}`, 300, '1').catch(() => {});
      emitToFollowers(io, userId, 'user_online', { userId }).catch(() => {});

      registerVipSocketHandlers(io, socket);

      socket.on('send_dm', async (payload: { recipientId?: string; content?: string }) => {
        const { recipientId, content } = payload ?? {};
        if (!recipientId || !content) { socket.emit('error', { message: 'recipientId and content are required' }); return; }
        try {
          const message = await messageService.sendDirectMessage(userId, recipientId, content);
          io.to(`user_${recipientId}`).emit('new_dm', { message });
          socket.emit('dm_sent', { message });
        } catch { socket.emit('error', { message: 'Failed to send message' }); }
      });

      socket.on('send_vip_message', async (payload: { roomId?: string; content?: string }) => {
        const { roomId, content } = payload ?? {};
        if (!roomId || !content) { socket.emit('error', { message: 'roomId and content are required' }); return; }
        try {
          const message = await messageService.sendVipRoomMessage(userId, roomId, content);
          io.to(`vip_room_${roomId}`).emit('new_vip_message', { message });
        } catch { socket.emit('error', { message: 'Failed to send VIP room message' }); }
      });

      socket.on('mark_dm_read', async (payload: { otherUserId?: string }) => {
        const { otherUserId } = payload ?? {};
        if (!otherUserId) return;
        try {
          await messageService.markMessagesAsRead(userId, otherUserId);
          io.to(`user_${otherUserId}`).emit('dm_read', { readBy: userId });
        } catch { /* silently ignore */ }
      });

      socket.on('typing_start', (payload: { recipientId?: string; roomId?: string }) => {
        const { recipientId, roomId } = payload ?? {};
        if (recipientId) io.to(`user_${recipientId}`).emit('user_typing', { userId });
        else if (roomId) io.to(`vip_room_${roomId}`).emit('user_typing', { userId });
      });

      socket.on('typing_stop', (payload: { recipientId?: string; roomId?: string }) => {
        const { recipientId, roomId } = payload ?? {};
        if (recipientId) io.to(`user_${recipientId}`).emit('user_stopped_typing', { userId });
        else if (roomId) io.to(`vip_room_${roomId}`).emit('user_stopped_typing', { userId });
      });

      socket.on('disconnect', async (reason) => {
        console.log(`Socket disconnected: ${socket.id} user=${userId} reason=${reason}`);
        redis.del(`online:${userId}`).catch(() => {});
        emitToFollowers(io, userId, 'user_offline', { userId }).catch(() => {});
      });
    } catch {
      socket.disconnect(true);
    }
  });
};
