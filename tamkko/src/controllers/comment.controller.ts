import { Response } from 'express';
import { AuthRequest } from '@middleware/auth';
import { catchAsync } from '@utils/catchAsync';
import { commentService } from '@services/comment.service';
import { io } from '@/index';

export const addVideoComment = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { videoId } = req.params;
  const { content, parentCommentId } = req.body as { content: string; parentCommentId?: string };

  const comment = await commentService.addComment(userId, videoId, 'Video', content, parentCommentId);

  io.to(`video_${videoId}`).emit('video_new_comment', { comment });

  res.status(201).json({ status: 'success', data: { comment } });
});

export const getVideoComments = catchAsync(async (req: AuthRequest, res: Response) => {
  const { videoId } = req.params;
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 20);

  const data = await commentService.getComments(videoId, 'Video', page, limit);
  res.json({ status: 'success', data });
});

export const getVideoCommentReplies = catchAsync(async (req: AuthRequest, res: Response) => {
  const { commentId } = req.params;
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 20);

  const data = await commentService.getReplies(commentId, page, limit);
  res.json({ status: 'success', data });
});

export const deleteVideoComment = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { commentId } = req.params;

  const data = await commentService.deleteComment(commentId, userId, req.user!.role);
  res.json({ status: 'success', data });
});

export const addVipPostComment = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { roomId, postId } = req.params;
  const { content, parentCommentId } = req.body as { content: string; parentCommentId?: string };

  const comment = await commentService.addComment(userId, postId, 'VIPPost', content, parentCommentId);

  io.to(`vip_room_${roomId}`).emit('vip_new_comment', { comment, postId });

  res.status(201).json({ status: 'success', data: { comment } });
});

export const getVipPostComments = catchAsync(async (req: AuthRequest, res: Response) => {
  const { postId } = req.params;
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 20);

  const data = await commentService.getComments(postId, 'VIPPost', page, limit);
  res.json({ status: 'success', data });
});

export const getVipPostCommentReplies = catchAsync(async (req: AuthRequest, res: Response) => {
  const { commentId } = req.params;
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 20);

  const data = await commentService.getReplies(commentId, page, limit);
  res.json({ status: 'success', data });
});

export const deleteVipPostComment = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { commentId } = req.params;

  const data = await commentService.deleteComment(commentId, userId, req.user!.role);
  res.json({ status: 'success', data });
});
