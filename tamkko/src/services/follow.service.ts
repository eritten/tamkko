import { Follow } from '@models/Follow';
import { ApiError } from '@utils/apiError';
import { sendNotification } from '@services/notifications.service';

const USER_SELECT = 'username profile.displayName profile.avatarUrl isAmbassador';

type UserSubset = {
  _id: unknown;
  username: string;
  profile: { displayName: string; avatarUrl: string };
  isAmbassador: boolean;
};

export const followService = {
  async toggleFollow(followerId: string, targetUserId: string): Promise<{ action: 'followed' | 'unfollowed' }> {
    if (followerId === targetUserId) throw new ApiError(400, 'You cannot follow yourself');

    const existing = await Follow.findOne({ follower: followerId, following: targetUserId });

    if (existing) {
      await existing.deleteOne();
      return { action: 'unfollowed' };
    }

    await Follow.create({ follower: followerId, following: targetUserId });

    await sendNotification(targetUserId, {
      type: 'new_follower',
      title: 'New follower',
      body: 'Someone started following you',
      data: { followerId },
    });

    return { action: 'followed' };
  },

  async getFollowers(userId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [follows, total] = await Promise.all([
      Follow.find({ following: userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate<{ follower: UserSubset }>('follower', USER_SELECT)
        .lean(),
      Follow.countDocuments({ following: userId }),
    ]);

    return {
      followers: follows.map((f) => f.follower),
      total,
      page,
      limit,
      hasMore: skip + follows.length < total,
    };
  },

  async getFollowing(userId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [follows, total] = await Promise.all([
      Follow.find({ follower: userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate<{ following: UserSubset }>('following', USER_SELECT)
        .lean(),
      Follow.countDocuments({ follower: userId }),
    ]);

    return {
      following: follows.map((f) => f.following),
      total,
      page,
      limit,
      hasMore: skip + follows.length < total,
    };
  },

  async getFollowCounts(userId: string): Promise<{ followers: number; following: number }> {
    const [followers, following] = await Promise.all([
      Follow.countDocuments({ following: userId }),
      Follow.countDocuments({ follower: userId }),
    ]);
    return { followers, following };
  },

  async isFollowing(followerId: string, targetUserId: string): Promise<boolean> {
    const exists = await Follow.exists({ follower: followerId, following: targetUserId });
    return Boolean(exists);
  },
};
