import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { Resend } from 'resend';
import { User, IUser } from '@models/User';
import { Referral } from '@models/Referral';
import { ApiError } from '@utils/apiError';
import { env } from '@config/env';

interface AuthTokens {
  access: string;
  refresh: string;
  expires_in: number;
  refresh_expires_in: number;
}

const parseDurationToSeconds = (duration: string): number => {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) return 900;
  const value = parseInt(match[1], 10);
  switch (match[2]) {
    case 's': return value;
    case 'm': return value * 60;
    case 'h': return value * 3600;
    case 'd': return value * 86400;
    default: return 900;
  }
};

const resend = new Resend(env.SENDGRID_API_KEY);

const generateReferralCode = (username?: string) => {
  const prefix = (username || 'TMK').replace(/[^a-z0-9]/gi, '').slice(0, 5).toUpperCase() || 'TMK';
  return `${prefix}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
};

const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

export class AuthService {
  async register(data: {
    email: string;
    phone: string;
    username: string;
    display_name?: string;
    password: string;
    country?: string;
    referralCode?: string;
    referral_code?: string;
  }): Promise<{ message: string }> {
    const existing = await User.findOne({
      $or: [{ email: data.email }, { phone: data.phone }, { username: data.username.toLowerCase() }],
    });
    if (existing) throw new ApiError(409, 'Email, phone, or username already registered');

    const submittedReferralCode = data.referralCode || data.referral_code;
    const referrer = submittedReferralCode
      ? await User.findOne({ 'referral.code': submittedReferralCode.toUpperCase(), isDeleted: false })
      : null;

    const user = await User.create({
      email: data.email,
      phone: data.phone,
      username: data.username.toLowerCase(),
      password: data.password,
      profile: {
        displayName: data.display_name || data.username,
        bio: '',
        avatarUrl: '',
        coverUrl: '',
        isVerified: false,
      },
      referral: {
        code: generateReferralCode(data.username),
        referredBy: referrer?._id,
        referralCount: 0,
        referralEarnings: 0,
      },
      referredBy: referrer?._id,
    });

    if (referrer) {
      referrer.referral.referralCount += 1;
      await referrer.save();
      await Referral.create({
        referrer: referrer._id,
        referred: user._id,
        referralCode: referrer.referral.code,
        status: 'pending',
      });
    }

    const otp = generateOtp();
    user.emailOtp = otp;
    user.emailOtpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: user.email,
      subject: 'Verify your Tamkko account',
      html: `<p>Your verification code is: <strong>${otp}</strong>. It expires in 10 minutes.</p>`,
    });

    return { message: 'Registration successful. Check your email for your verification code.' };
  }

  async verifyEmail(email: string, otp: string): Promise<{ user: IUser; tokens: AuthTokens }> {
    const user = await User.findOne({ email: email.toLowerCase() }).select('+emailOtp +emailOtpExpiresAt');
    if (!user) throw new ApiError(404, 'User not found');
    if (user.isEmailVerified) throw new ApiError(400, 'Email already verified');
    if (user.emailOtp !== otp) throw new ApiError(400, 'Invalid OTP');
    if (!user.emailOtpExpiresAt || user.emailOtpExpiresAt < new Date()) throw new ApiError(400, 'OTP has expired');

    user.isEmailVerified = true;
    user.emailOtp = undefined;
    user.emailOtpExpiresAt = undefined;
    await user.save();

    const safeUser = await User.findById(user._id).select('-password');
    if (!safeUser) throw new ApiError(500, 'Failed to load user');

    return { user: safeUser, tokens: this.generateTokens(user) };
  }

  async resendOtp(email: string): Promise<{ message: string }> {
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) throw new ApiError(404, 'User not found');
    if (user.isEmailVerified) throw new ApiError(400, 'Email already verified');

    const otp = generateOtp();
    user.emailOtp = otp;
    user.emailOtpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: user.email,
      subject: 'Verify your Tamkko account',
      html: `<p>Your verification code is: <strong>${otp}</strong>. It expires in 10 minutes.</p>`,
    });

    return { message: 'OTP sent successfully' };
  }

  async login(identifier: string, password: string): Promise<{ user: IUser; tokens: AuthTokens }> {
    const user = await User.findOne({
      $or: [{ email: identifier.toLowerCase() }, { username: identifier.toLowerCase() }, { phone: identifier }],
      isDeleted: false,
    }).select('+password');
    if (!user || !(await bcrypt.compare(password, user.password))) {
      throw new ApiError(401, 'Invalid credentials');
    }

    if (!user.isEmailVerified) {
      throw new ApiError(403, 'Please verify your email before logging in');
    }

    user.lastLoginAt = new Date();
    await user.save();

    const safeUser = await User.findById(user._id).select('-password');
    if (!safeUser) throw new ApiError(404, 'User not found');

    return { user: safeUser, tokens: this.generateTokens(user) };
  }

  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    try {
      const decoded = jwt.verify(refreshToken, env.jwtRefreshSecret) as { userId: string };
      const user = await User.findOne({ _id: decoded.userId, isDeleted: false });
      if (!user) throw new ApiError(401, 'User not found');
      return this.generateTokens(user);
    } catch {
      throw new ApiError(401, 'Invalid refresh token');
    }
  }

  private generateTokens(user: Pick<IUser, '_id' | 'role' | 'email'>): AuthTokens {
    const payload = { id: user._id.toString(), userId: user._id.toString(), role: user.role, email: user.email };
    const accessOptions: SignOptions = { expiresIn: env.jwtAccessExpiration as SignOptions['expiresIn'] };
    const refreshOptions: SignOptions = { expiresIn: env.jwtRefreshExpiration as SignOptions['expiresIn'] };

    return {
      access: jwt.sign(payload, env.jwtSecret, accessOptions),
      refresh: jwt.sign({ userId: user._id.toString() }, env.jwtRefreshSecret, refreshOptions),
      expires_in: parseDurationToSeconds(env.jwtAccessExpiration),
      refresh_expires_in: parseDurationToSeconds(env.jwtRefreshExpiration),
    };
  }
}

export const authService = new AuthService();
