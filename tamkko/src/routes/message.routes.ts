import { Router } from 'express';
import { auth } from '@middleware/auth';
import { validate } from '@middleware/validate';
import * as messageController from '@controllers/message.controller';
import { sendMessageSchema, editMessageSchema, sendMediaMessageSchema, reactionSchema, pageSchema } from '@validators/message.validator';

const router = Router();

// Static routes first
router.get('/conversations', auth(), messageController.getConversations);

// Two-segment routes before one-segment param routes
router.post('/:userId/media', auth(), validate(sendMediaMessageSchema), messageController.sendMediaMessage);
router.post('/:messageId/react', auth(), validate(reactionSchema), messageController.toggleMessageReaction);
router.patch('/:messageId/edit', auth(), validate(editMessageSchema), messageController.editMessage);
router.delete('/:messageId', auth(), messageController.deleteMessage);

// One-segment param routes
router.post('/:userId', auth(), validate(sendMessageSchema), messageController.sendDirectMessage);
router.get('/:userId', auth(), validate(pageSchema), messageController.getDirectMessages);
router.patch('/:userId/read', auth(), messageController.markAsRead);

export default router;
