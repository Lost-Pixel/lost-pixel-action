import { createReadStream } from 'node:fs';
import FormData from 'form-data';
import axios from 'axios';
import { log } from './log';
// import { log, logMemory } from './log';
// import type { LogMemory } from './log';
import type { PlatformModeConfig } from './config';
// import type { WebhookEvent } from './types';

type ApiAction =
  | 'getApiToken'
  | 'init'
  | 'finalize'
  | 'prepareUpload'
  | 'uploadShot';

export const apiClient = axios.create({
  headers: {
    'Content-type': 'application/json',
    'x-api-version': '3',
  },
});

const apiRoutes: Record<ApiAction, string> = {
  getApiToken: '/auth/get-api-token',
  init: '/app/init',
  // next: '/app/next',
  finalize: '/app/finalize',
  prepareUpload: '/file/prepare-upload',
  uploadShot: '/file/upload-shot',
};

type ApiPayloadGetApiToken = {
  apiKey: string;
  projectIdentifier: string;
};

type ApiPayloadInit = {
  projectId: string;
  branchName: string;
  repoOwner: string;
  repoName: string;
  commit: string;
};

// type ApiPayloadNext = {
//   projectId: string;
//   branchName: string;
//   repoOwner: string;
//   repoName: string;
//   commit: string;
//   buildId: string;
//   buildNumber: string;
//   branchRef: string;
//   buildMeta?: WebhookEvent;
//   success: boolean;
//   log: LogMemory;
// };

type ApiPayloadFinalize = {
  projectId: string;
  branchName: string;
  repoOwner: string;
  repoName: string;
  commit: string;
};

type ApiPayloadPrepareUpload = {
  branchName: string;
  commit: string;
  buildNumber: string;
  fileHashes: string[];
};

type ApiPayloadUploadShot = {
  uploadToken: string;
  name: string;
  file: string;
};

type ApiPayload<
  A extends ApiAction,
  P extends Record<string, unknown>,
  F = undefined,
> = {
  action: A;
  apiToken?: string;
  payload: P;
  fileKey?: F;
};

type ApiPayloads =
  | ApiPayload<'getApiToken', ApiPayloadGetApiToken>
  | ApiPayload<'init', ApiPayloadInit>
  // | ApiPayload<'next', ApiPayloadNext>
  | ApiPayload<'finalize', ApiPayloadFinalize>
  | ApiPayload<'prepareUpload', ApiPayloadPrepareUpload>
  | ApiPayload<'uploadShot', ApiPayloadUploadShot, 'file'>;

export const sendToAPI = async <T extends Record<string, unknown>>(
  config: PlatformModeConfig,
  parameters: ApiPayloads,
): Promise<T> => {
  log.process('info', `⚡️ Sending to API [${parameters.action}]`);

  try {
    let payload: ApiPayloads['payload'] | FormData = parameters.payload;

    if (parameters.fileKey) {
      const form = new FormData();

      for (const [key, element] of Object.entries(parameters.payload)) {
        if (key === parameters.fileKey) {
          form.append(key, createReadStream(element));
        } else {
          form.append(key, element);
        }
      }

      payload = form;
    }

    const response = await apiClient.post(
      `${config.lostPixelPlatform}${apiRoutes[parameters.action]}`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${parameters.apiToken ?? ''}`,
        },
      },
    );

    if (response.status !== 200 && response.status !== 201) {
      log.process(
        'error',
        `Error: Failed to send to API [${parameters.action}]. Status: ${response.status} ${response.statusText}`,
      );

      process.exit(1);
    }

    const outdatedApiRequest = response?.headers?.['x-api-version-warning'];

    if (outdatedApiRequest && parameters.action === 'init') {
      log.process(
        'info',
        [
          '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
          `~~ ⚠️  ${outdatedApiRequest}`,
          '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
        ].join('\n'),
      );
    }

    log.process('info', `🤘 Successfully sent to API [${parameters.action}]`);

    return response.data as T;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      log.process(
        'error',
        'API response: ',
        error.response?.data || error.message,
      );
    } else if (error instanceof Error) {
      log.process('error', error.message);
    } else {
      log.process('error', error);
    }

    process.exit(1);
  }
};

export const getApiToken = async (config: PlatformModeConfig) => {
  return sendToAPI<{ apiToken: string }>(config, {
    action: 'getApiToken',
    payload: {
      apiKey: config.apiKey ?? 'undefined',
      projectIdentifier: config.lostPixelProjectId,
    },
  });
};

export const sendInitToAPI = async (
  config: PlatformModeConfig,
  apiToken: string,
) => {
  const [repoOwner, repoName] = config.repository.split('/');

  return sendToAPI(config, {
    action: 'init',
    apiToken,
    payload: {
      projectId: config.lostPixelProjectId,
      branchName: config.commitRefName,
      repoOwner,
      repoName,
      commit: config.commitHash,
    },
  });
};

// export const sendResultToAPI = async ({
//   config,
//   success,
//   apiToken,
//   event,
// }: {
//   config: PlatformModeConfig,
//   success: boolean;
//   apiToken: string;
//   event?: WebhookEvent;
// }) => {
//   if (config.generateOnly) {
//     return;
//   }

//   const [repoOwner, repoName] = config.repository.split('/');

//   return sendToAPI({
//     action: 'next',
//     apiToken,
//     payload: {
//       projectId: config.lostPixelProjectId,
//       buildId: config.ciBuildId,
//       buildNumber: config.ciBuildNumber,
//       branchRef: config.commitRef,
//       branchName: config.commitRefName,
//       repoOwner,
//       repoName,
//       commit: config.commitHash,
//       buildMeta: event,
//       success,
//       log: logMemory,
//     },
//   });
// };

export const sendFinalizeToAPI = async (
  config: PlatformModeConfig,
  apiToken: string,
) => {
  const [repoOwner, repoName] = config.repository.split('/');

  return sendToAPI(config, {
    action: 'finalize',
    apiToken,
    payload: {
      projectId: config.lostPixelProjectId,
      branchName: config.commitRefName,
      repoOwner,
      repoName,
      commit: config.commitHash,
    },
  });
};

export const prepareUpload = async (
  config: PlatformModeConfig,
  apiToken: string,
  fileHashes: string[],
) => {
  return sendToAPI<{ requiredFileHashes: string[]; uploadToken: string }>(
    config,
    {
      action: 'prepareUpload',
      apiToken,
      payload: {
        branchName: config.commitRefName,
        commit: config.commitHash,
        buildNumber: config.ciBuildNumber,
        fileHashes,
      },
    },
  );
};

export const uploadShot = async (
  config: PlatformModeConfig,
  apiToken: string,
  uploadToken: string,
  name: string,
  file: string,
) => {
  return sendToAPI<{
    success: true;
    details: {
      projectIdentifier: string;
      commit: string;
      buildNumber: string;
      branchName: string;
      name: string;
    };
  }>(config, {
    action: 'uploadShot',
    apiToken,
    payload: {
      uploadToken,
      name,
      file,
    },
  });
};
