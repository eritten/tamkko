import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { register, login, refreshToken, getMe } from '@controllers/auth.controller';
import { validate } from '@middleware/validate';
import { registerSchema, loginSchema, refreshSchema } from '@validators/auth.validator';
import { auth } from '@middleware/auth';

const router = Router();
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

const authRateLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES_MS,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/register', authRateLimiter, validate(registerSchema), register);
router.post('/login', authRateLimiter, validate(loginSchema), login);
router.post('/login/email', validate(loginSchema), login);
router.post('/login/phone', validate(loginSchema), login);
router.post('/refresh', validate(refreshSchema), refreshToken);
router.post('/token/refresh', validate(refreshSchema), refreshToken);
router.get('/me', auth(), getMe);

export { router as authRoutes };
