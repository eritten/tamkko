import { Router } from 'express';
import {
  getUserNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  registerToken,
} from '../controllers/notifications.controller';
import { auth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { registerPushTokenSchema } from '../validators/notification.validator';

const router = Router();

router.use(auth());

router.post('/register-token', validate(registerPushTokenSchema), registerToken);
router.get('/', getUserNotifications);
router.get('/unread-count', getUnreadCount);
router.patch('/:id/read', markAsRead);
router.put('/:id/read', markAsRead);
router.post('/read-all', markAllAsRead);
router.put('/read-all', markAllAsRead);
router.delete('/:id', deleteNotification);

export default router;
