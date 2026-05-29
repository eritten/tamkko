import { Router } from 'express';
import { auth } from '@middleware/auth';
import { validate } from '@middleware/validate';
import * as followController from '@controllers/follow.controller';
import { pageSchema } from '@validators/follow.validator';

const router = Router();

router.post('/:userId/follow', auth(), followController.toggleFollow);
router.get('/:userId/followers', auth(), validate(pageSchema), followController.getFollowers);
router.get('/:userId/following', auth(), validate(pageSchema), followController.getFollowing);
router.get('/:userId/follow-counts', auth(), followController.getFollowCounts);
router.get('/:userId/profile', auth(), followController.getUserProfile);

export default router;
