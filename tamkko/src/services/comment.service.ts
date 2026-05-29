import { Comment, ICommentDoc } from '@models/Comment';
import { Video } from '@models/Video';
import { VIPPost } from '@models/VIPPost';
import { VIPMembership } from '@models/VIPMembership';
import { ApiError } from '@utils/apiError';
import { sendNotification } from '@services/notifications.service';

type TargetModel = 'Video' | 'VIPPost';

const AUTHOR_SELECT = 'username profile.displayName profile.avatarUrl';

interface CommentService {
  addComment(userId: string, targetId: string, targetModel: TargetModel, content: string, parentCommentId?: string): Promise<ICommentDoc>;
  getComments(targetId: string, targetModel: TargetModel, page: number, limit: number): Promise<{ comments: (Record<string, unknown> & { replyCount: number })[]; total: number; page: number; limit: number; hasMore: boolean }>;
  getReplies(parentCommentId: string, page: number, limit: number): Promise<{ replies: Record<string, unknown>[]; total: number; page: number; limit: number; hasMore: boolean }>;
  deleteComment(commentId: string, actorId: string, actorRole: string): Promise<{ message: string }>;
}

export const commentService: CommentService = {
  async addComment(
    userId: string,
    targetId: string,
    targetModel: TargetModel,
    content: string,
    parentCommentId?: string
  ) {
    let ownerId: string;

    if (targetModel === 'Video') {
      const video = await Video.findOne({ _id: targetId, isDeleted: false });
      if (!video) throw new ApiError(404, 'Video not found');
      ownerId = video.creator.toString();
    } else {
      const post = await VIPPost.findOne({ _id: targetId, isDeleted: false });
      if (!post) throw new ApiError(404, 'VIP post not found');

      const membership = await VIPMembership.findOne({
        user: userId,
        vipRoom: post.room,
        status: 'active',
        isDeleted: false,
      });
      if (!membership) throw new ApiError(403, 'You must be an active member of this VIP room to comment');

      ownerId = post.author.toString();
    }

    if (parentCommentId) {
      const parent = await Comment.findOne({ _id: parentCommentId, target: targetId, isDeleted: false });
      if (!parent) throw new ApiError(404, 'Parent comment not found');
    }

    const comment = await Comment.create({
      author: userId,
      target: targetId,
      targetModel,
      content,
      parentComment: parentCommentId ?? null,
    });

    const populated = await comment.populate('author', AUTHOR_SELECT);

    if (ownerId !== userId) {
      const targetLabel = targetModel === 'Video' ? 'video' : 'post';
      await sendNotification(ownerId, {
        type: 'new_comment',
        title: 'New comment',
        body: `Someone commented on your ${targetLabel}`,
        data: { commentId: comment._id.toString(), targetId, targetModel },
      });
    }

    return populated;
  },

  async getComments(targetId: string, targetModel: TargetModel, page: number, limit: number) {
    const skip = (page - 1) * limit;

    const [comments, total] = await Promise.all([
      Comment.find({ target: targetId, targetModel, isDeleted: false, parentComment: null })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('author', AUTHOR_SELECT)
        .lean(),
      Comment.countDocuments({ target: targetId, targetModel, isDeleted: false, parentComment: null }),
    ]);

    const commentsWithReplyCounts = await Promise.all(
      comments.map(async (comment) => {
        const replyCount = await Comment.countDocuments({ parentComment: comment._id, isDeleted: false });
        return { ...comment, replyCount };
      })
    );

    return {
      comments: commentsWithReplyCounts,
      total,
      page,
      limit,
      hasMore: skip + comments.length < total,
    };
  },

  async getReplies(parentCommentId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;

    const [replies, total] = await Promise.all([
      Comment.find({ parentComment: parentCommentId, isDeleted: false })
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(limit)
        .populate('author', AUTHOR_SELECT)
        .lean(),
      Comment.countDocuments({ parentComment: parentCommentId, isDeleted: false }),
    ]);

    return {
      replies,
      total,
      page,
      limit,
      hasMore: skip + replies.length < total,
    };
  },

  async deleteComment(commentId: string, actorId: string, actorRole: string) {
    const comment = await Comment.findOne({ _id: commentId, isDeleted: false });
    if (!comment) throw new ApiError(404, 'Comment not found');

    const isAuthor = comment.author.toString() === actorId;
    const isPrivileged = actorRole === 'admin' || actorRole === 'moderator';

    if (!isAuthor && !isPrivileged) {
      throw new ApiError(403, 'You do not have permission to delete this comment');
    }

    comment.isDeleted = true;
    await comment.save();

    await Comment.updateMany({ parentComment: commentId }, { isDeleted: true });

    return { message: 'Comment deleted' };
  },
};
