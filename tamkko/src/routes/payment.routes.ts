import crypto from 'crypto';
import express, { Request, Response, Router } from 'express';
import { env } from '@/config/env';
import { Referral } from '@/models/Referral';
import { Transaction, TransactionStatus, TransactionType } from '@/models/Transaction';
import { User } from '@/models/User';
import { VIPMembership } from '@/models/VIPMembership';
import { VIPRoom } from '@/models/vipRoom.model';
import { sendNotification } from '@/services/notifications.service';

interface PaystackWebhookPayload {
  event?: string;
  data?: {
    reference?: string;
    amount?: number;
    status?: string;
    metadata?: Record<string, any>;
  };
}

const router = Router();
const toMoney = (value: number) => value.toFixed(2);

const isValidPaystackSignature = (body: Buffer, signature?: string | string[]) => {
  if (!env.PAYSTACK_SECRET_KEY || !signature || Array.isArray(signature)) return false;

  const digest = crypto
    .createHmac('sha512', env.PAYSTACK_SECRET_KEY)
    .update(body)
    .digest('hex');

  const digestBuffer = Buffer.from(digest, 'hex');
  const signatureBuffer = Buffer.from(signature, 'hex');

  return digestBuffer.length === signatureBuffer.length && crypto.timingSafeEqual(digestBuffer, signatureBuffer);
};

const userIdForNotification = (recipient: unknown) => {
  if (typeof recipient === 'string') return recipient;
  if (recipient && typeof recipient === 'object' && '_id' in recipient) {
    return String((recipient as { _id: unknown })._id);
  }
  return String(recipient);
};

const notify = async (
  recipient: unknown,
  type: string,
  title: string,
  message: string,
  data: Record<string, unknown> = {}
) => {
  await sendNotification(userIdForNotification(recipient), {
    type,
    title,
    body: message,
    data,
  });
};

const handleSuccessfulCharge = async (payload: PaystackWebhookPayload) => {
  const reference = payload.data?.reference;
  if (!reference) return;

  const transaction = await Transaction.findOne({ providerTransactionId: reference });
  if (!transaction || transaction.status === TransactionStatus.COMPLETED) return;

  transaction.status = TransactionStatus.COMPLETED;
  transaction.providerResponse = payload.data;
  transaction.processedAt = new Date();
  await transaction.save();

  const metadata = payload.data?.metadata || transaction.metadata || {};
  if (metadata.type === 'tip' || transaction.type === TransactionType.TIP) {
    const recipientId = transaction.tipRecipient || metadata.recipientId;
    if (!recipientId) return;

    const creatorEarnings = Number(transaction.metadata?.creator_earnings_ghs || transaction.amount);
    await User.findByIdAndUpdate(recipientId, {
      $inc: {
        'wallet.balance': creatorEarnings,
        'stats.totalTipsReceived': creatorEarnings,
      },
    });

    // Activate referral bonus on recipient's first payment
    const pendingReferral = await Referral.findOne({ referred: recipientId, status: 'pending' });
    if (pendingReferral) {
      pendingReferral.status = 'completed';
      pendingReferral.rewardAmount = env.REFERRAL_BONUS_GHS;
      await pendingReferral.save();

      await User.findByIdAndUpdate(pendingReferral.referrer, {
        $inc: { 'wallet.balance': env.REFERRAL_BONUS_GHS, 'referral.referralEarnings': env.REFERRAL_BONUS_GHS },
      });

      await notify(
        pendingReferral.referrer,
        'referral_bonus',
        'You earned a referral bonus',
        `You earned a referral bonus of GHS ${toMoney(env.REFERRAL_BONUS_GHS)}`,
        { referralId: pendingReferral._id }
      );
    }

    await Promise.all([
      notify(
        transaction.user,
        'tip_sent',
        'Your tip was sent',
        `Your tip of GHS ${toMoney(transaction.amount)} was sent.`,
        { transactionId: transaction._id, reference }
      ),
      notify(
        recipientId,
        'tip_received',
        `You received a tip of GHS ${toMoney(transaction.amount)}`,
        `You received a tip of GHS ${toMoney(transaction.amount)}.`,
        { transactionId: transaction._id, reference }
      ),
    ]);
  }

  if (metadata.type === 'vip_subscription' || transaction.type === TransactionType.VIP_SUBSCRIPTION) {
    const roomId = transaction.vipRoom || metadata.roomId;
    const userId = transaction.user;
    if (!roomId) return;

    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 1);

    const existingMembership = await VIPMembership.findOne({ user: userId, vipRoom: roomId });
    const wasActive = existingMembership?.status === 'active' && !existingMembership.isDeleted;

    await VIPMembership.findOneAndUpdate(
      { user: userId, vipRoom: roomId },
      {
        user: userId,
        vipRoom: roomId,
        startDate: new Date(),
        endDate,
        autoRenew: Boolean(metadata.autoRenew),
        status: 'active',
        isDeleted: false,
      },
      { new: true, upsert: true }
    );

    if (!wasActive) {
      await VIPRoom.updateOne({ _id: roomId }, { $inc: { memberCount: 1 } });
    }

    await notify(
      userId,
      'vip_joined',
      'You have joined the VIP room',
      'You have joined the VIP room.',
      { transactionId: transaction._id, roomId, reference }
    );
  }
};

const handleTransferSuccess = async (payload: PaystackWebhookPayload) => {
  const reference = payload.data?.reference;
  if (!reference) return;

  const transaction = await Transaction.findOne({ providerTransactionId: reference });
  if (!transaction || transaction.status === TransactionStatus.COMPLETED) return;

  transaction.status = TransactionStatus.COMPLETED;
  transaction.providerResponse = payload.data;
  transaction.processedAt = new Date();
  await transaction.save();

  await notify(
    transaction.user,
    'withdrawal_processed',
    'Your withdrawal was processed',
    `Your withdrawal of GHS ${toMoney(transaction.amount)} was processed.`,
    { transactionId: transaction._id, reference }
  );
};

const handleTransferFailed = async (payload: PaystackWebhookPayload) => {
  const reference = payload.data?.reference;
  if (!reference) return;

  const transaction = await Transaction.findOne({ providerTransactionId: reference });
  if (!transaction || transaction.status === TransactionStatus.FAILED) return;

  transaction.status = TransactionStatus.FAILED;
  transaction.providerResponse = payload.data;
  transaction.processedAt = new Date();
  await transaction.save();

  await User.findByIdAndUpdate(transaction.user, {
    $inc: { 'wallet.balance': transaction.amount },
  });

  await notify(
    transaction.user,
    'withdrawal_failed',
    'Your withdrawal failed',
    `Your withdrawal of GHS ${toMoney(transaction.amount)} failed.`,
    { transactionId: transaction._id, reference }
  );
};

router.post('/webhook/paystack', express.raw({ type: 'application/json' }), async (req: Request, res: Response) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));

  if (!isValidPaystackSignature(rawBody, req.headers['x-paystack-signature'])) {
    return res.status(401).json({ status: 'error', message: 'Invalid Paystack signature' });
  }

  try {
    const payload = JSON.parse(rawBody.toString('utf8')) as PaystackWebhookPayload;

    if (payload.event === 'charge.success') {
      await handleSuccessfulCharge(payload);
    } else if (payload.event === 'transfer.success') {
      await handleTransferSuccess(payload);
    } else if (payload.event === 'transfer.failed') {
      await handleTransferFailed(payload);
    }
  } catch (error) {
    console.error('Paystack webhook processing failed:', error);
  }

  return res.status(200).json({ received: true });
});

export default router;
