import { Video, IVideo } from '@models/Video';
import { Follow } from '@models/Follow';
import * as cloudflareService from '@services/cloudflare.service';
import { sendNotification } from '@services/notifications.service';
import { likeService } from '@services/like.service';
import { ApiError } from '@utils/apiError';

interface CloudflareWebhookPayload {
  type?: string;
  event?: string;
  uid?: string;
  playback?: {
    hls?: string;
  };
  video?: {
    uid?: string;
    playback?: {
      hls?: string;
    };
  };
  data?: {
    uid?: string;
    playback?: {
      hls?: string;
    };
  };
  result?: {
    uid?: string;
    playback?: {
      hls?: string;
    };
  };
}

export class VideoService {
  async initializeUpload(input: {
    creatorId: string;
    title: string;
    description?: string;
    videoUrl?: string;
    thumbnailUrl?: string;
    tags?: string[];
    category?: string;
  }): Promise<{ video: IVideo; uploadURL: string }> {
    const upload = await cloudflareService.getUploadUrl();
    const video = await Video.create({
      creator: input.creatorId,
      title: input.title,
      description: input.description || '',
      videoUrl: '',
      thumbnailUrl: input.thumbnailUrl || '',
      tags: input.tags || [],
      category: input.category || 'general',
      status: 'pending',
      cloudflareId: upload.uid,
    });

    return { video, uploadURL: upload.uploadURL };
  }

  async getUploadStatus(videoId: string) {
    const video = await Video.findById(videoId);
    if (!video) throw new ApiError(404, 'Video not found');
    if (!video.cloudflareId) throw new ApiError(400, 'Video is missing a Cloudflare Stream id');

    const cloudflareStatus = await cloudflareService.getVideoStatus(video.cloudflareId);
    if (cloudflareStatus.status === 'ready' && cloudflareStatus.playbackUrl) {
      video.status = 'ready';
      video.videoUrl = cloudflareStatus.playbackUrl;
      await video.save();
    }

    return {
      video_id: video._id,
      cloudflare_id: video.cloudflareId,
      status: video.status,
      cloudflare_status: cloudflareStatus.status,
      playback_url: video.videoUrl || cloudflareStatus.playbackUrl,
      ready_to_stream: video.status === 'ready',
    };
  }

  async handleCloudflareWebhook(payload: CloudflareWebhookPayload) {
    const eventType = payload.type || payload.event;
    if (eventType !== 'stream.video.finished') {
      return { received: true, ignored: true };
    }

    const cloudflareId = payload.uid || payload.video?.uid || payload.data?.uid || payload.result?.uid;
    if (!cloudflareId) throw new ApiError(400, 'Cloudflare webhook payload is missing video uid');

    const playbackUrl =
      payload.playback?.hls ||
      payload.video?.playback?.hls ||
      payload.data?.playback?.hls ||
      payload.result?.playback?.hls ||
      null;

    const video = await Video.findOne({ cloudflareId, isDeleted: false });
    if (!video) return { received: true, video_found: false };

    video.status = 'ready';
    if (playbackUrl) video.videoUrl = playbackUrl;
    await video.save();

    await sendNotification(video.creator.toString(), {
      type: 'video_ready',
      title: 'Your video is ready',
      body: 'Your video is ready to stream.',
      data: {
        videoId: video._id,
        cloudflareId,
      },
    });

    return { received: true, video_found: true, video_id: video._id };
  }

  async getFeed(limit = 20, cursor?: string) {
    const query: Record<string, unknown> = { isPublic: true, isDeleted: false };
    if (cursor) query._id = { $lt: cursor };
    const videos = await Video.find(query).sort({ _id: -1 }).limit(Math.min(limit, 50)).populate('creator', 'username profile');
    return {
      videos,
      next_cursor: videos.length ? videos[videos.length - 1]._id.toString() : null,
      has_more: videos.length === limit,
    };
  }

  async getVideo(videoId: string) {
    const video = await Video.findOne({ _id: videoId, isDeleted: false }).populate('creator', 'username profile');
    if (!video) throw new ApiError(404, 'Video not found');
    return video;
  }

  async incrementView(videoId: string) {
    const video = await Video.findByIdAndUpdate(videoId, { $inc: { views: 1 } }, { new: true });
    if (!video) throw new ApiError(404, 'Video not found');
    return { video_id: video._id, views: video.views };
  }

  async getUserVideos(userId: string, limit = 20, cursor?: string) {
    const query: Record<string, unknown> = { creator: userId, isDeleted: false };
    if (cursor) query._id = { $lt: cursor };
    const videos = await Video.find(query).sort({ _id: -1 }).limit(Math.min(limit, 50));
    return {
      videos,
      next_cursor: videos.length ? videos[videos.length - 1]._id.toString() : null,
      has_more: videos.length === limit,
    };
  }

  async reportVideo(videoId: string, reporterId: string, reason: string, description?: string) {
    const video = await Video.findById(videoId);
    if (!video) throw new ApiError(404, 'Video not found');
    return {
      video_id: video._id,
      reporter_id: reporterId,
      reason,
      description,
      status: 'received',
    };
  }

  async getPersonalizedFeed(userId: string, page = 1, limit = 20): Promise<{
    videos: (Record<string, unknown> & { likeCount: number; dislikeCount: number })[];
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
    personalized: boolean;
  }> {
    const clampedLimit = Math.min(limit, 50);
    const skip = (page - 1) * clampedLimit;
    const creatorSelect = 'username profile.displayName profile.avatarUrl';

    const follows = await Follow.find({ follower: userId }).select('following').lean();
    const followingIds = follows.map((f) => f.following);

    const filter = followingIds.length > 0
      ? { creator: { $in: followingIds }, isPublic: true, isDeleted: false }
      : { isPublic: true, isDeleted: false };

    const [videos, total] = await Promise.all([
      Video.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(clampedLimit)
        .populate('creator', creatorSelect)
        .lean(),
      Video.countDocuments(filter),
    ]);

    const videosWithCounts = await Promise.all(
      videos.map(async (video) => {
        const counts = await likeService.getLikeCounts(String(video._id), 'Video');
        return { ...video, likeCount: counts.likes, dislikeCount: counts.dislikes };
      })
    );

    return {
      videos: videosWithCounts,
      total,
      page,
      limit: clampedLimit,
      hasMore: skip + videos.length < total,
      personalized: followingIds.length > 0,
    };
  }

  async deleteVideo(videoId: string, userId: string, role: 'user' | 'creator' | 'moderator' | 'admin') {
    const filter = role === 'admin' || role === 'moderator'
      ? { _id: videoId, isDeleted: false }
      : { _id: videoId, creator: userId, isDeleted: false };

    const video = await Video.findOneAndUpdate(
      filter,
      { isDeleted: true },
      { new: true }
    );
    if (!video) throw new ApiError(404, 'Video not found or permission denied');
  }
}

export const videoService = new VideoService();
