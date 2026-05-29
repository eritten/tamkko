import axios, { AxiosError } from 'axios';
import { env } from '@config/env';
import { ApiError } from '@utils/apiError';

interface CloudflareError {
  message?: string;
}

interface CloudflareResponse<T> {
  success: boolean;
  errors?: CloudflareError[];
  result: T;
}

interface DirectUploadResult {
  uploadURL: string;
  uid: string;
}

interface StreamVideoResult {
  uid: string;
  status?: {
    state?: string;
  };
  playback?: {
    hls?: string;
  };
}

const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4';

const getCloudflareConfig = () => {
  if (!env.CLOUDFLARE_ACCOUNT_ID) {
    throw new ApiError(500, 'CLOUDFLARE_ACCOUNT_ID is required for Cloudflare Stream uploads.');
  }
  if (!env.CLOUDFLARE_API_TOKEN) {
    throw new ApiError(500, 'CLOUDFLARE_API_TOKEN is required for Cloudflare Stream uploads.');
  }

  return {
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: env.CLOUDFLARE_API_TOKEN,
  };
};

const cloudflareErrorMessage = (error: unknown) => {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<CloudflareResponse<unknown>>;
    const cloudflareMessage = axiosError.response?.data?.errors?.[0]?.message;
    return cloudflareMessage || axiosError.message;
  }

  return error instanceof Error ? error.message : 'Cloudflare Stream request failed.';
};

export const getUploadUrl = async (): Promise<DirectUploadResult> => {
  const { accountId, apiToken } = getCloudflareConfig();

  try {
    const response = await axios.post<CloudflareResponse<DirectUploadResult>>(
      `${CLOUDFLARE_API_BASE}/accounts/${accountId}/stream/direct_upload`,
      {
        maxDurationSeconds: 3600,
        requireSignedURLs: false,
      },
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data.result;
  } catch (error) {
    throw new ApiError(502, `Cloudflare Stream upload URL request failed: ${cloudflareErrorMessage(error)}`);
  }
};

export const getVideoStatus = async (
  cloudflareId: string
): Promise<{ status: string; playbackUrl: string | null }> => {
  const { accountId, apiToken } = getCloudflareConfig();

  try {
    const response = await axios.get<CloudflareResponse<StreamVideoResult>>(
      `${CLOUDFLARE_API_BASE}/accounts/${accountId}/stream/${cloudflareId}`,
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
        },
      }
    );

    return {
      status: response.data.result.status?.state || 'unknown',
      playbackUrl: response.data.result.playback?.hls || null,
    };
  } catch (error) {
    throw new ApiError(502, `Cloudflare Stream status request failed: ${cloudflareErrorMessage(error)}`);
  }
};
