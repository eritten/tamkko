import { Document, Types } from 'mongoose';

export interface IUser extends Document {
  _id: Types.ObjectId;
  username: string;
  email: string;
  phone: string;
  password: string;
  role: 'user' | 'creator' | 'moderator' | 'admin';
  profile: {
    displayName: string;
    bio: string;
    avatarUrl: string;
    coverUrl: string;
    isVerified: boolean;
  };
  wallet: {
    balance: number;
    pendingBalance: number;
    currency: string;
    lastWithdrawalAt?: Date;
  };
  referral: {
    code: string;
    referredBy?: Types.ObjectId;
    referralCount: number;
    referralEarnings: number;
  };
  referredBy?: Types.ObjectId;
  ambassadorStatus: 'none' | 'pending' | 'approved' | 'rejected';
  isAmbassador: boolean;
  settings: {
    pushNotifications: boolean;
    emailNotifications: boolean;
    isPrivate: boolean;
    blockedUsers: Types.ObjectId[];
  };
  stats: {
    followersCount: number;
    followingCount: number;
    videosCount: number;
    totalTipsReceived: number;
    totalViews: number;
  };
  isDeleted: boolean;
  expoPushToken?: string;
  lastLoginAt?: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

export interface IVideo extends Document {
  _id: Types.ObjectId;
  title: string;
  description: string;
  videoUrl: string;
  thumbnailUrl: string;
  creator: Types.ObjectId;
  views: number;
  likes: number;
  duration: number;
  isPublic: boolean;
  tags: string[];
  category: string;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  cloudflareId?: string;
  isDeleted: boolean;
}

export interface ITransaction extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  type: 'tip' | 'deposit' | 'withdrawal' | 'referral_bonus' | 'vip_purchase' | 'vip_subscription' | 'refund';
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  provider: 'hubtel_momo' | 'hubtel_card' | 'paystack' | 'paystack_transfer' | 'wallet' | 'manual';
  providerTransactionId?: string;
  providerResponse?: Record<string, any>;
  description?: string;
  metadata?: Record<string, any>;
  video?: Types.ObjectId;
  tipRecipient?: Types.ObjectId;
  referralCode?: string;
  vipRoom?: Types.ObjectId;
  processedAt?: Date;
  isDeleted: boolean;
}

export interface INotification extends Document {
  _id: Types.ObjectId;
  recipient: Types.ObjectId;
  type: string;
  category: 'social' | 'earnings' | 'system';
  title: string;
  message: string;
  data: Record<string, unknown>;
  isRead: boolean;
  isDeleted: boolean;
}

export interface IReferral extends Document {
  _id: Types.ObjectId;
  referrer: Types.ObjectId;
  referred: Types.ObjectId;
  referralCode: string;
  status: 'pending' | 'completed' | 'inactive';
  rewardAmount: number;
  isDeleted: boolean;
}

export interface IVIPRoom extends Document {
  _id: Types.ObjectId;
  name: string;
  description?: string;
  creator: Types.ObjectId;
  tier: 'gold' | 'platinum' | 'diamond';
  monthlyFee: number;
  campusCode?: string;
  bannedUsers: Types.ObjectId[];
  memberCount: number;
  isActive: boolean;
  isDeleted: boolean;
}

export interface IVIPMembership extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  vipRoom: Types.ObjectId;
  startDate: Date;
  endDate: Date;
  autoRenew: boolean;
  status: 'active' | 'expired' | 'cancelled' | 'pending_payment';
  isDeleted: boolean;
}
