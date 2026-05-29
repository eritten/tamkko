import { Like } from '@models/Like';

type TargetModel = 'Video' | 'VIPPost';
type ReactionType = 'like' | 'dislike';

export const likeService = {
  async toggleLike(userId: string, targetId: string, targetModel: TargetModel, type: ReactionType) {
    const existing = await Like.findOne({ user: userId, target: targetId, targetModel });

    let action: 'added' | 'removed' | 'switched';

    if (existing) {
      if (existing.type === type) {
        await existing.deleteOne();
        action = 'removed';
      } else {
        existing.type = type;
        await existing.save();
        action = 'switched';
      }
    } else {
      await Like.create({ user: userId, target: targetId, targetModel, type });
      action = 'added';
    }

    const counts = await likeService.getLikeCounts(targetId, targetModel);
    return { action, type, ...counts };
  },

  async getLikeCounts(targetId: string, targetModel: TargetModel) {
    const [likes, dislikes] = await Promise.all([
      Like.countDocuments({ target: targetId, targetModel, type: 'like' }),
      Like.countDocuments({ target: targetId, targetModel, type: 'dislike' }),
    ]);
    return { likes, dislikes };
  },

  async getUserReaction(userId: string, targetId: string, targetModel: TargetModel): Promise<ReactionType | null> {
    const existing = await Like.findOne({ user: userId, target: targetId, targetModel });
    return existing ? existing.type : null;
  },
};
