import { Response } from 'express';
import { AuthRequest } from '@middleware/auth';
import { catchAsync } from '@utils/catchAsync';
import { followService } from '@services/follow.service';
import { User } from '@models/User';
import { ApiError } from '@utils/apiError';
import { io } from '@/index';

export const toggleFollow = catchAsync(async (req: AuthRequest, res: Response) => {
  const followerId = req.user!.id;
  const { userId: targetUserId } = req.params;

  const result = await followService.toggleFollow(followerId, targetUserId);

  if (result.action === 'followed') {
    const follower = await User.findById(followerId)
      .select('username profile.displayName profile.avatarUrl')
      .lean();
    io.to(`user_${targetUserId}`).emit('new_follower', { follower });
  }

  res.json({ status: 'success', data: result });
});

export const getFollowers = catchAsync(async (req: AuthRequest, res: Response) => {
  const { userId } = req.params;
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 20);

  const data = await followService.getFollowers(userId, page, limit);
  res.json({ status: 'success', data });
});

export const getFollowing = catchAsync(async (req: AuthRequest, res: Response) => {
  const { userId } = req.params;
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 20);

  const data = await followService.getFollowing(userId, page, limit);
  res.json({ status: 'success', data });
});

export const getFollowCounts = catchAsync(async (req: AuthRequest, res: Response) => {
  const { userId } = req.params;
  const data = await followService.getFollowCounts(userId);
  res.json({ status: 'success', data });
});

export const getUserProfile = catchAsync(async (req: AuthRequest, res: Response) => {
  const viewerId = req.user!.id;
  const { userId } = req.params;

  const user = await User.findOne({ _id: userId, isDeleted: false }).select('-password').lean();
  if (!user) throw new ApiError(404, 'User not found');

  const [counts, isFollowedByMe] = await Promise.all([
    followService.getFollowCounts(userId),
    followService.isFollowing(viewerId, userId),
  ]);

  res.json({
    status: 'success',
    data: {
      user: {
        ...user,
        followerCount: counts.followers,
        followingCount: counts.following,
        isFollowedByMe,
      },
    },
  });
});
