import { Response } from 'express';
import { AuthRequest } from '@middleware/auth';
import { videoService } from '@services/video.service';
import { catchAsync } from '@utils/catchAsync';

export const videoController = {
  initializeUpload: catchAsync(async (req: AuthRequest, res: Response) => {
    const result = await videoService.initializeUpload({
      creatorId: req.user!.id,
      ...req.body,
    });
    res.status(201).json({ status: 'success', data: result });
  }),

  getUploadStatus: catchAsync(async (req, res: Response) => {
    const result = await videoService.getUploadStatus(req.params.uploadId);
    res.json({ status: 'success', data: result });
  }),

  getFeed: catchAsync(async (req, res: Response) => {
    const result = await videoService.getFeed(Number(req.query.limit || 20), req.query.cursor as string | undefined);
    res.json({ status: 'success', data: result });
  }),

  getVideo: catchAsync(async (req, res: Response) => {
    const result = await videoService.getVideo(req.params.videoId);
    res.json({ status: 'success', data: { video: result } });
  }),

  incrementView: catchAsync(async (req, res: Response) => {
    const result = await videoService.incrementView(req.params.videoId);
    res.json({ status: 'success', data: result });
  }),

  getUserVideos: catchAsync(async (req, res: Response) => {
    const result = await videoService.getUserVideos(
      req.params.userId,
      Number(req.query.limit || 20),
      req.query.cursor as string | undefined
    );
    res.json({ status: 'success', data: result });
  }),

  reportVideo: catchAsync(async (req: AuthRequest, res: Response) => {
    const result = await videoService.reportVideo(req.params.videoId, req.user!.id, req.body.reason, req.body.description);
    res.json({ status: 'success', message: 'Video reported successfully', data: result });
  }),

  deleteVideo: catchAsync(async (req: AuthRequest, res: Response) => {
    await videoService.deleteVideo(req.params.videoId, req.user!.id, req.user!.role);
    res.status(204).send();
  }),

  handleCloudflareWebhook: catchAsync(async (req, res: Response) => {
    const result = await videoService.handleCloudflareWebhook(req.body);
    res.status(200).json({ status: 'success', data: result });
  }),

  getPersonalizedFeed: catchAsync(async (req: AuthRequest, res: Response) => {
    const result = await videoService.getPersonalizedFeed(
      req.user!.id,
      Number(req.query.page ?? 1),
      Number(req.query.limit ?? 20)
    );
    res.json({ status: 'success', data: result });
  }),
};
