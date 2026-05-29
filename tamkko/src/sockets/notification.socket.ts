import { Server } from 'socket.io';

export const emitNotification = (io: Server, userId: string, notification: object) => {
  io.to(`user_${userId}`).emit('new_notification', notification);
};
