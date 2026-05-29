import { Server, Socket } from 'socket.io';
import { VIPMembership } from '@models/VIPMembership';

interface VipRoomPayload {
  roomId?: string;
}

interface VipPostPayload extends VipRoomPayload {
  post?: unknown;
}

const isActiveVipMember = async (userId: string, roomId?: string) => {
  if (!roomId) return false;

  const membership = await VIPMembership.findOne({
    user: userId,
    vipRoom: roomId,
    status: 'active',
    isDeleted: false,
  });

  return Boolean(membership);
};

export const registerVipSocketHandlers = (_io: Server, socket: Socket) => {
  socket.on('join_vip_room', async ({ roomId }: VipRoomPayload) => {
    const userId = socket.data.userId as string | undefined;
    if (!userId || !(await isActiveVipMember(userId, roomId))) {
      socket.emit('error', { message: 'Not a member of this room' });
      return;
    }

    socket.join(`vip_room_${roomId}`);
  });

  socket.on('leave_vip_room', ({ roomId }: VipRoomPayload) => {
    if (roomId) socket.leave(`vip_room_${roomId}`);
  });

  socket.on('vip_new_post', async ({ roomId, post }: VipPostPayload) => {
    const userId = socket.data.userId as string | undefined;
    if (!userId || !(await isActiveVipMember(userId, roomId))) {
      socket.emit('error', { message: 'Not a member of this room' });
      return;
    }

    socket.to(`vip_room_${roomId}`).emit('vip_post_received', post);
  });
};
