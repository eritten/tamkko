import express from 'express';
import { protect, restrictTo } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import * as vipController from '@/controllers/vip.controller';
import * as vipValidator from '@/validators/vip.validator';
import * as likeController from '@/controllers/like.controller';
import { toggleLikeSchema } from '@/validators/like.validator';
import * as commentController from '@/controllers/comment.controller';
import { addCommentSchema, pageSchema } from '@/validators/comment.validator';
import { getVipRoomMessages } from '@/controllers/message.controller';
import { pageSchema as messagePageSchema } from '@/validators/message.validator';

const router = express.Router();

router.get('/campus/:campusCode', validate(vipValidator.campusCodeSchema), vipController.getRoomsByCampus);

router.use(protect);

router.post(
  '/campus-codes/generate',
  restrictTo('admin', 'moderator'),
  validate(vipValidator.generateCampusCodeSchema),
  vipController.generateCampusCode
);
router.get('/campus-codes', restrictTo('admin', 'moderator'), vipController.listCampusCodes);

router.post('/rooms', restrictTo('admin', 'creator', 'moderator'), validate(vipValidator.createRoomSchema), vipController.createRoom);
router.get('/rooms', vipController.listRooms);
router.get('/rooms/:roomId', vipController.getRoom);
router.patch('/rooms/:roomId', restrictTo('admin', 'creator', 'moderator'), validate(vipValidator.updateRoomSchema), vipController.updateRoom);
router.delete('/rooms/:roomId', restrictTo('admin', 'creator', 'moderator'), vipController.deleteRoom);

router.post('/rooms/:roomId/join', validate(vipValidator.joinRoomSchema), vipController.joinRoom);
router.post('/rooms/:roomId/leave', vipController.leaveRoom);
router.get('/rooms/:roomId/members', vipController.getRoomMembers);
router.post('/rooms/:roomId/kick', validate(vipValidator.kickMemberSchema), vipController.kickMember);
router.post('/rooms/:roomId/ban', validate(vipValidator.banMemberSchema), vipController.banMember);
router.post('/:roomId/kick/:userId', validate(vipValidator.kickMemberSchema), vipController.kickMember);
router.post('/:roomId/ban/:userId', validate(vipValidator.banMemberSchema), vipController.banMember);

router.post('/rooms/:roomId/posts', validate(vipValidator.createPostSchema), vipController.createPost);
router.get('/rooms/:roomId/posts', validate(vipValidator.getRoomPostsSchema), vipController.getRoomPosts);
router.delete('/posts/:postId', validate(vipValidator.deletePostSchema), vipController.deletePost);
router.post('/:roomId/posts', validate(vipValidator.createPostSchema), vipController.createPost);
router.get('/:roomId/posts', validate(vipValidator.getRoomPostsSchema), vipController.getRoomPosts);
router.delete('/:roomId/posts/:postId', validate(vipValidator.deletePostSchema), vipController.deletePost);

router.post('/:roomId/posts/:postId/like', validate(toggleLikeSchema), likeController.toggleVipPostLike);

router.post('/:roomId/posts/:postId/comments', validate(addCommentSchema), commentController.addVipPostComment);
router.get('/:roomId/posts/:postId/comments', validate(pageSchema), commentController.getVipPostComments);
router.get('/:roomId/posts/:postId/comments/:commentId/replies', validate(pageSchema), commentController.getVipPostCommentReplies);
router.delete('/:roomId/posts/:postId/comments/:commentId', commentController.deleteVipPostComment);

router.get('/:roomId/messages', validate(messagePageSchema), getVipRoomMessages);
router.get('/rooms/:roomId/messages', validate(messagePageSchema), getVipRoomMessages);

router.post('/rooms/:roomId/pay', validate(vipValidator.processPaymentSchema), vipController.processPayment);
router.post('/webhooks/hubtel', vipController.handlePaymentWebhook);
router.get('/rooms/:roomId/revenue', restrictTo('admin', 'creator', 'moderator'), vipController.getRoomRevenue);

export default router;
