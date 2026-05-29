import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { auth, AuthRequest } from '@middleware/auth';
import { validate } from '@middleware/validate';
import { User } from '@models/User';
import { ApiError } from '@utils/apiError';

const router = Router();

const ambassadorStatusSchema = z.object({
  body: z.object({
    status: z.enum(['approved', 'rejected']),
  }),
});

router.patch(
  '/users/:userId/ambassador-status',
  auth(['admin']),
  validate(ambassadorStatusSchema),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params;
      const { status } = req.body as { status: 'approved' | 'rejected' };

      const user = await User.findById(userId).select('-password');
      if (!user) throw new ApiError(404, 'User not found');

      user.ambassadorStatus = status;
      if (status === 'approved') {
        user.isAmbassador = true;
      }
      await user.save();

      res.status(200).json({ status: 'success', data: user });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
