import { Transaction, TransactionStatus, TransactionType, PaymentProvider } from '@models/Transaction';
import { User } from '@models/User';
import * as paystackService from '@services/paystack.service';
import { sendNotification } from '@services/notifications.service';
import { ApiError } from '@utils/apiError';
import { env } from '@config/env';
import { v4 as uuidv4 } from 'uuid';

const toMoney = (value: number) => value.toFixed(2);

export async function processTip(userId: string, payload: { creator_id: string; video_id?: string; amount_ghs: string; message?: string }) {
  if (userId === payload.creator_id) throw new ApiError(403, 'You cannot tip yourself');
  const amount = Number(payload.amount_ghs);
  if (!Number.isFinite(amount) || amount < 1) throw new ApiError(400, 'Minimum tip amount is GHS 1.00');

  const sender = await User.findById(userId);
  if (!sender) throw new ApiError(404, 'Sender not found');

  const creator = await User.findById(payload.creator_id);
  if (!creator) throw new ApiError(404, 'Creator not found');

  const reference = `tip_${uuidv4()}`;
  const transaction = await Transaction.create({
    user: userId,
    type: TransactionType.TIP,
    amount,
    currency: 'GHS',
    status: TransactionStatus.PENDING,
    provider: PaymentProvider.PAYSTACK,
    providerTransactionId: reference,
    tipRecipient: creator._id,
    video: payload.video_id,
    description: payload.message,
    metadata: {
      creator_earnings_ghs: toMoney(amount * 0.85),
      platform_fee_ghs: toMoney(amount * 0.15),
    },
  });

  const paystack = await paystackService.initializeTransaction({
    email: sender.email,
    amount,
    reference,
    callbackUrl: `${env.CLIENT_URL}/payments/callback`,
    metadata: {
      type: 'tip',
      transactionId: transaction._id.toString(),
      senderId: userId,
      recipientId: creator._id.toString(),
      videoId: payload.video_id,
    },
  });

  return {
    tip_id: transaction._id,
    status: transaction.status,
    payment_reference: paystack.reference,
    authorization_url: paystack.authorizationUrl,
    amount_ghs: toMoney(amount),
    creator_earnings_ghs: toMoney(amount * 0.85),
    platform_fee_ghs: toMoney(amount * 0.15),
    poll_url: `/api/v1/tips/${transaction._id}/status`,
  };
}

export async function getTipStatus(userId: string, tipId: string) {
  const transaction = await Transaction.findOne({ _id: tipId, user: userId, type: TransactionType.TIP });
  if (!transaction) throw new ApiError(404, 'Tip not found');
  return { tip_id: transaction._id, status: transaction.status, amount_ghs: toMoney(transaction.amount) };
}

export async function getWalletBalance(userId: string) {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, 'User not found');
  return {
    wallet: {
      owner_id: user._id,
      currency: user.wallet.currency,
      available_balance: toMoney(user.wallet.balance),
      pending_balance: toMoney(user.wallet.pendingBalance),
      total_earned: toMoney(user.stats.totalTipsReceived),
      minimum_withdrawal: '10.00',
      maximum_withdrawal_per_day: '2000.00',
      can_withdraw: user.wallet.balance >= 10,
    },
  };
}

export async function requestWithdrawal(userId: string, payload: {
  amount_ghs: string;
  account_number: string;
  bank_code: string;
  account_name?: string;
}) {
  const amount = Number(payload.amount_ghs);
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, 'User not found');
  if (amount < 10) throw new ApiError(400, 'Withdrawal amount is below the GHS 10.00 minimum');
  if (user.wallet.balance < amount) throw new ApiError(400, 'Insufficient available balance');

  const reference = `wd_${uuidv4()}`;
  const recipient = await paystackService.createTransferRecipient({
    name: payload.account_name || user.profile.displayName || user.username,
    accountNumber: payload.account_number,
    bankCode: payload.bank_code,
  });

  const transfer = await paystackService.initializeTransfer({
    amount,
    recipient,
    reference,
    reason: 'Tamkko wallet withdrawal',
  });

  user.wallet.balance -= amount;
  user.wallet.lastWithdrawalAt = new Date();
  await user.save();

  const transaction = await Transaction.create({
    user: user._id,
    type: TransactionType.WITHDRAWAL,
    amount,
    currency: 'GHS',
    status: TransactionStatus.PENDING,
    provider: PaymentProvider.PAYSTACK_TRANSFER,
    providerTransactionId: reference,
    providerResponse: transfer,
    description: 'Wallet withdrawal',
    metadata: {
      recipient,
      account_number: payload.account_number,
      bank_code: payload.bank_code,
    },
  });

  await sendNotification(user._id.toString(), {
    type: 'withdrawal_processing',
    title: 'Your withdrawal is being processed',
    body: `Your withdrawal of GHS ${toMoney(amount)} is being processed.`,
    data: { transactionId: transaction._id, reference },
  });

  return {
    withdrawal_id: transaction._id,
    transfer_reference: reference,
    amount_ghs: toMoney(amount),
    status: 'processing',
    new_available_balance: toMoney(user.wallet.balance),
  };
}

export async function getTransactionHistory(userId: string, query: { type?: string; limit?: number }) {
  const filter: Record<string, unknown> = { user: userId };
  if (query.type && query.type !== 'all') filter.type = query.type;
  const transactions = await Transaction.find(filter).sort({ createdAt: -1 }).limit(Math.min(Number(query.limit || 20), 50));
  return { transactions, has_more: false, next_cursor: null };
}

export async function processPayout(withdrawalId: string, _payload: unknown) {
  const transaction = await Transaction.findByIdAndUpdate(
    withdrawalId,
    { status: TransactionStatus.COMPLETED, processedAt: new Date() },
    { new: true }
  );
  if (!transaction) throw new ApiError(404, 'Withdrawal not found');
  return transaction;
}

export async function getPlatformRevenue() {
  const tips = await Transaction.find({ type: TransactionType.TIP, status: TransactionStatus.COMPLETED });
  const total = tips.reduce((sum, tip) => sum + tip.amount * 0.15, 0);
  return { total_revenue_ghs: toMoney(total), transaction_counts: { total_tips: tips.length } };
}
