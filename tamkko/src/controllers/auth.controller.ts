import { Response } from 'express';
import { AuthRequest } from '@middleware/auth';
import { authService } from '@services/auth.service';
import { followService } from '@services/follow.service';
import { User } from '@models/User';
import { ApiError } from '@utils/apiError';
import { catchAsync } from '@utils/catchAsync';

export const register = catchAsync(async (req, res: Response) => {
  const { user, tokens } = await authService.register(req.body);
  res.status(201).json({ status: 'success', data: { user, tokens } });
});

export const login = catchAsync(async (req, res: Response) => {
  const { identifier, email, phone, password } = req.body;
  const resolvedIdentifier = identifier || email || phone;
  const { user, tokens } = await authService.login(resolvedIdentifier, password);
  res.json({ status: 'success', data: { user, tokens } });
});

export const refreshToken = catchAsync(async (req, res: Response) => {
  const tokens = await authService.refreshToken(req.body.refreshToken || req.body.refresh);
  res.json({ status: 'success', data: { tokens } });
});

export const getMe = catchAsync(async (req: AuthRequest, res: Response) => {
  const user = await User.findById(req.user!.id).select('-password').lean();
  if (!user) throw new ApiError(404, 'User not found');

  const counts = await followService.getFollowCounts(req.user!.id);

  res.json({
    status: 'success',
    data: {
      user: {
        ...user,
        followerCount: counts.followers,
        followingCount: counts.following,
      },
    },
  });
});
