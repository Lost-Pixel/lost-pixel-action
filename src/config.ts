import { existsSync } from 'fs';
import { loadTSProjectConfigFile, log } from './utils';
import get from 'lodash.get';
import path from 'path';
import { BrowserContextOptions, Page } from 'playwright';

type BaseConfig = {
  // Browser to use: chromium, firefox, or webkit
  browser: 'chromium' | 'firefox' | 'webkit';
  // URL of the Lost Pixel API endpoint (default: https://app.lost-pixel.com/api/callback)
  lostPixelUrl: string;
  // URL of the Storybook instance or local folder
  storybookUrl: string;
  // Path to the baseline image folder
  imagePathBaseline: string;
  // Path to the current image folder
  imagePathCurrent: string;
  // Path to the difference image folder
  imagePathDifference: string;
  // Number of concurrent shots to take
  shotConcurrency: number;
  // Number of concurrent screenshots to compare
  compareConcurrency: number;
  // Timeouts for various stages of the test
  timeouts: {
    // Timeout for fetching stories from Storybook
    fetchStories?: number;
    // Timeout for loading the state of the page
    loadState?: number;
    // Timeout for waiting for network requests to finish
    networkRequests?: number;
  };
  // Time to wait before taking a screenshot
  waitBeforeScreenshot: number;
  // Time to wait for the first network request to start
  waitForFirstRequest: number;
  // Time to wait for the last network request to start
  waitForLastRequest: number;

  // Threshold for the difference between the baseline and current image
  pixelDifferenceThreshold: number;
};

type StoryLike = {
  id?: string;
  kind?: string;
  story?: string;
  parameters?: Record<string, unknown>;
};

export type ProjectConfig = {
  // Project ID
  lostPixelProjectId: string;
  // CI build ID
  ciBuildId: string;
  // CI build number
  ciBuildNumber: string;
  // Git repository name (e.g. 'lost-pixel/lost-pixel-storybook')
  repository: string;
  // Git branch name (e.g. 'refs/heads/main')
  commitRef: string;
  // Git branch name (e.g. 'main')
  commitRefName: string;
  // Git commit SHA (e.g. 'b9b8b9b9b9b9b9b9b9b9b9b9b9b9b9b9b9b9b9b9')
  commitHash: string;
  // S3 configuration
  s3: {
    // S3 endpoint
    endPoint: string;
    // S3 server port number
    port?: number;
    // use SSL
    ssl?: boolean;
    // S3 region
    region?: string;
    // S3 access key
    accessKey: string;
    // S3 secret key
    secretKey: string;
    // S3 session token
    sessionToken?: string;
    // S3 bucket name
    bucketName: string;
    // S3 base URL
    baseUrl?: string;
  };
  // File path to event.json file
  eventFilePath?: string;
  // Global story filter
  filterStory?: (input: StoryLike) => boolean;
  // File name generator for images
  imageFilenameGenerator?: (input: StoryLike) => string;
  // Configure browser context options
  configureBrowser?: (input: StoryLike) => BrowserContextOptions;
  // Configure page before screenshot
  beforeScreenshot?: (page: Page, input: { id: string }) => Promise<void>;
};

const requiredConfigProps: Array<keyof FullConfig> = [
  'lostPixelProjectId',
  'ciBuildId',
  'ciBuildNumber',
  'repository',
  'commitRef',
  'commitRefName',
  'commitHash',
  's3',
];

const requiredS3ConfigProps: Array<keyof FullConfig['s3']> = [
  'endPoint',
  'accessKey',
  'secretKey',
  'bucketName',
];

export type FullConfig = BaseConfig & ProjectConfig;
export type CustomProjectConfig = Partial<BaseConfig> & ProjectConfig;

const defaultConfig: BaseConfig = {
  browser: 'chromium',
  lostPixelUrl: 'https://app.lost-pixel.com/api/callback',
  storybookUrl: 'storybook-static',
  imagePathBaseline: '.lostpixel/baseline/',
  imagePathCurrent: '.lostpixel/current/',
  imagePathDifference: '.lostpixel/difference/',
  shotConcurrency: 5,
  compareConcurrency: 10,
  timeouts: {
    fetchStories: 30_000,
    loadState: 30_000,
    networkRequests: 30_000,
  },
  waitBeforeScreenshot: 1_000,
  waitForFirstRequest: 1_000,
  waitForLastRequest: 1_000,
  pixelDifferenceThreshold: 0,
};

export let config: FullConfig;

const checkConfig = () => {
  const missingProps: string[] = [];

  const requiredProps = [
    ...requiredConfigProps,
    ...requiredS3ConfigProps.map((prop) => `s3.${prop}`),
  ];

  requiredProps.forEach((prop) => {
    if (!get(config, prop)) {
      missingProps.push(prop);
    }
  });

  if (missingProps.length > 0) {
    log(
      `Error: Missing required configuration properties: ${missingProps.join(
        ', ',
      )}`,
    );
    process.exit(1);
  }
};

const configFileNameBase = path.join(
  process.env.LOST_PIXEL_CONFIG_DIR || process.cwd(),
  'lostpixel.config',
);

const loadProjectConfig = async (): Promise<CustomProjectConfig> => {
  log('Loading project configuration...');
  log('Current working directory:', process.cwd());
  log('Defined configuration directory:', process.env.LOST_PIXEL_CONFIG_DIR);
  log('Looking for configuration file:', `${configFileNameBase}.(js|ts)`);

  if (existsSync(`${configFileNameBase}.js`)) {
    const projectConfig = require(`${configFileNameBase}.js`);
    return projectConfig;
  } else if (existsSync(`${configFileNameBase}.ts`)) {
    try {
      const imported = (await loadTSProjectConfigFile(
        `${configFileNameBase}.ts`,
      )) as CustomProjectConfig;
      return imported;
    } catch (error) {
      log(error);
      log('Failed to load TypeScript configuration file');
      process.exit(1);
    }
  }

  throw new Error("Couldn't find project config file 'lostpixel.config.js'");
};

export const configure = async (customProjectConfig?: CustomProjectConfig) => {
  if (customProjectConfig) {
    config = {
      ...defaultConfig,
      ...customProjectConfig,
    };

    return;
  }

  const projectConfig = await loadProjectConfig();

  config = {
    ...defaultConfig,
    ...projectConfig,
  };

  checkConfig();
};
