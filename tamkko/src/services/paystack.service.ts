import axios, { AxiosError } from 'axios';
import { env } from '@config/env';
import { ApiError } from '@utils/apiError';

interface PaystackResponse<T> {
  status: boolean;
  message: string;
  data: T;
}

interface InitializeTransactionInput {
  email: string;
  amount: number;
  reference: string;
  metadata?: Record<string, unknown>;
  callbackUrl?: string;
}

interface InitializeTransactionResult {
  authorizationUrl: string;
  reference: string;
}

interface InitializeTransferInput {
  amount: number;
  recipient: string;
  reason: string;
  reference: string;
}

interface CreateTransferRecipientInput {
  name: string;
  accountNumber: string;
  bankCode: string;
}

const PAYSTACK_API_BASE = 'https://api.paystack.co';

const getPaystackSecret = () => {
  if (!env.PAYSTACK_SECRET_KEY) {
    throw new ApiError(500, 'PAYSTACK_SECRET_KEY is required for Paystack payments.');
  }

  return env.PAYSTACK_SECRET_KEY;
};

const paystackHeaders = () => ({
  Authorization: `Bearer ${getPaystackSecret()}`,
  'Content-Type': 'application/json',
});

const paystackErrorMessage = (error: unknown) => {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<PaystackResponse<unknown>>;
    return axiosError.response?.data?.message || axiosError.message;
  }

  return error instanceof Error ? error.message : 'Paystack request failed.';
};

export const initializeTransaction = async ({
  email,
  amount,
  reference,
  metadata,
  callbackUrl,
}: InitializeTransactionInput): Promise<InitializeTransactionResult> => {
  try {
    const response = await axios.post<
      PaystackResponse<{ authorization_url: string; reference: string }>
    >(
      `${PAYSTACK_API_BASE}/transaction/initialize`,
      {
        email,
        amount: Math.round(amount * 100),
        reference,
        metadata,
        callback_url: callbackUrl,
      },
      { headers: paystackHeaders() }
    );

    return {
      authorizationUrl: response.data.data.authorization_url,
      reference: response.data.data.reference,
    };
  } catch (error) {
    throw new ApiError(502, `Paystack transaction initialization failed: ${paystackErrorMessage(error)}`);
  }
};

export const verifyTransaction = async (reference: string) => {
  try {
    const response = await axios.get<PaystackResponse<Record<string, unknown>>>(
      `${PAYSTACK_API_BASE}/transaction/verify/${reference}`,
      { headers: paystackHeaders() }
    );

    return response.data.data;
  } catch (error) {
    throw new ApiError(502, `Paystack transaction verification failed: ${paystackErrorMessage(error)}`);
  }
};

export const initializeTransfer = async ({
  amount,
  recipient,
  reason,
  reference,
}: InitializeTransferInput) => {
  try {
    const response = await axios.post<PaystackResponse<Record<string, unknown>>>(
      `${PAYSTACK_API_BASE}/transfer`,
      {
        source: 'balance',
        amount: Math.round(amount * 100),
        recipient,
        reason,
        reference,
      },
      { headers: paystackHeaders() }
    );

    return response.data.data;
  } catch (error) {
    throw new ApiError(502, `Paystack transfer initialization failed: ${paystackErrorMessage(error)}`);
  }
};

export const createTransferRecipient = async ({
  name,
  accountNumber,
  bankCode,
}: CreateTransferRecipientInput) => {
  try {
    const response = await axios.post<PaystackResponse<{ recipient_code: string }>>(
      `${PAYSTACK_API_BASE}/transferrecipient`,
      {
        type: 'nuban',
        name,
        account_number: accountNumber,
        bank_code: bankCode,
        currency: 'GHS',
      },
      { headers: paystackHeaders() }
    );

    return response.data.data.recipient_code;
  } catch (error) {
    throw new ApiError(502, `Paystack transfer recipient creation failed: ${paystackErrorMessage(error)}`);
  }
};
