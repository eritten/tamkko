import { Response } from 'express';
import { AuthRequest } from '@middleware/auth';
import { catchAsync } from '@utils/catchAsync';
import { likeService } from '@services/like.service';
import { VIPPost } from '@models/VIPPost';
import { VIPMembership } from '@models/VIPMembership';
import { Video } from '@models/Video';
import { ApiError } from '@utils/apiError';
import { io } from '@/index';

export const toggleVideoLike = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { videoId } = req.params;
  const { type } = req.body as { type: 'like' | 'dislike' };

  const result = await likeService.toggleLike(userId, videoId, 'Video', type);

  // Emit socket event to the video creator's room
  const video = await Video.findById(videoId).select('creator').lean();
  if (video) {
    io.to(`user_${video.creator.toString()}`).emit('video_reaction_updated', {
      videoId,
      likes: result.likes,
      dislikes: result.dislikes,
    });
  }

  res.json({ status: 'success', data: result });
});

export const toggleVipPostLike = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { postId, roomId } = req.params;
  const { type } = req.body as { type: 'like' | 'dislike' };

  const post = await VIPPost.findOne({ _id: postId, isDeleted: false });
  if (!post) throw new ApiError(404, 'VIP post not found');

  const targetRoomId = roomId || post.room.toString();
  const membership = await VIPMembership.findOne({
    user: userId,
    vipRoom: targetRoomId,
    status: 'active',
    isDeleted: false,
  });
  if (!membership) throw new ApiError(403, 'You must be an active member of this VIP room to react to posts');

  const result = await likeService.toggleLike(userId, postId, 'VIPPost', type);

  res.json({ status: 'success', data: result });
});

export const getVideoReactions = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { videoId } = req.params;

  const [counts, userReaction] = await Promise.all([
    likeService.getLikeCounts(videoId, 'Video'),
    likeService.getUserReaction(userId, videoId, 'Video'),
  ]);

  res.json({ status: 'success', data: { ...counts, userReaction } });
});
