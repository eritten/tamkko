import { Referral } from '@models/Referral';
import { User } from '@models/User';
import { ApiError } from '@utils/apiError';

export const referralService = {
  async getMyCode(userId: string) {
    const user = await User.findById(userId);
    if (!user) throw new ApiError(404, 'User not found');
    const code = user.referral.code;
    const total_referrals = await Referral.countDocuments({ referrer: userId, isDeleted: false });
    return {
      referral_code: code,
      referral_link: `https://tamkko.app/join/${code}`,
      deep_link: `tamkko://join/${code}`,
      share_text: `Join me on Tamkko: https://tamkko.app/join/${code}`,
      total_referrals,
      active_referrals: total_referrals,
      total_earned_ghs: user.referral.referralEarnings.toFixed(2),
      reward_rate_percent: 5,
      is_ambassador: user.isAmbassador,
      ambassador_status: user.ambassadorStatus,
    };
  },

  async validateCode(code: string) {
    const referrer = await User.findOne({ 'referral.code': code.toUpperCase(), isDeleted: false });
    if (!referrer) throw new ApiError(404, 'Referral code not found');
    return {
      referral_code: code.toUpperCase(),
      is_valid: true,
      referrer: {
        username: referrer.username,
        display_name: referrer.profile.displayName,
        profile_picture: referrer.profile.avatarUrl,
        is_ambassador: referrer.isAmbassador,
        total_referrals: referrer.referral.referralCount,
      },
      message: `${referrer.profile.displayName || referrer.username} invited you to join Tamkko!`,
    };
  },

  async network(userId: string) {
    const referrals = await Referral.find({ referrer: userId, isDeleted: false }).populate('referred', 'username profile createdAt');
    return {
      summary: {
        total_referred: referrals.length,
        active_referred: referrals.filter((referral) => referral.status === 'completed').length,
        inactive_referred: referrals.filter((referral) => referral.status !== 'completed').length,
        total_earned_ghs: referrals.reduce((sum, referral) => sum + referral.rewardAmount, 0).toFixed(2),
        reward_rate_percent: 5,
      },
      referrals,
      next_cursor: null,
      has_more: false,
    };
  },

  async earnings(userId: string, period = '30d') {
    const referrals = await Referral.find({ referrer: userId, isDeleted: false });
    const total = referrals.reduce((sum, referral) => sum + referral.rewardAmount, 0);
    return {
      period,
      total_earned_ghs: total.toFixed(2),
      total_rewards_count: referrals.length,
      average_reward_ghs: referrals.length ? (total / referrals.length).toFixed(2) : '0.00',
      daily_earnings: [],
      all_time_earned_ghs: total.toFixed(2),
      reward_rate_percent: 5,
    };
  },

  async leaderboard(limit = 20) {
    const entries = await Referral.aggregate([
      { $match: { status: 'completed', isDeleted: false } },
      { $group: { _id: '$referrer', completedReferrals: { $sum: 1 } } },
      { $sort: { completedReferrals: -1 } },
      { $limit: Math.min(limit, 10) },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: '$user' },
      {
        $project: {
          _id: 0,
          referrerId: '$_id',
          completedReferrals: 1,
          user: {
            username: '$user.username',
            display_name: '$user.profile.displayName',
            profile_picture: '$user.profile.avatarUrl',
            is_verified: '$user.profile.isVerified',
            is_ambassador: '$user.isAmbassador',
          },
        },
      },
    ]);

    return {
      leaderboard_type: 'top_referrers',
      period: 'all_time',
      updated_at: new Date().toISOString(),
      entries: entries.map((entry, index) => ({
        rank: index + 1,
        user: entry.user,
        total_referrals: entry.completedReferrals,
        active_referrals: entry.completedReferrals,
        badge: index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : null,
      })),
    };
  },

  async applyAmbassador(userId: string, _body: Record<string, unknown>) {
    const user = await User.findById(userId).select('-password');
    if (!user) throw new ApiError(404, 'User not found');
    user.ambassadorStatus = 'pending';
    await user.save();
    return user;
  },
};
