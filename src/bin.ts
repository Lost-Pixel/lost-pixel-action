#!/usr/bin/env node

import path from 'node:path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import fs from 'fs-extra';
import { log } from './log';
import { getPlatformApiToken, platformRunner, runner } from './runner';
import { getVersion } from './utils';
import { sendFinalizeToAPI } from './api';
import { config, configure } from './config';

type CommandArgs = ['init-js', 'init-ts', 'finalize'];

const args = yargs(hideBin(process.argv)).parse();
// @ts-expect-error TBD
const commandArgs = args._ as CommandArgs;

const version = getVersion();

if (version) {
  log.process('info', `Version: ${version}`);
}

(async () => {
  if (commandArgs.includes('init-js')) {
    log.process('info', 'Initializing javascript lost-pixel config');

    await fs.copy(
      path.join(
        __dirname,
        '..',
        'config-templates',
        'example.lostpixel.config.js',
      ),
      path.join(process.cwd(), './lostpixel.config.js'),
    );
    log.process('info', '✅ Config successfully initialized');
  } else if (commandArgs.includes('init-ts')) {
    log.process('info', 'Initializing typescript lost-pixel config');

    // Replace local type resolution with module resolution
    const file = fs.readFileSync(
      path.join(
        __dirname,
        '..',
        'config-templates',
        'example.lostpixel.config.ts',
      ),
    );
    const modifiedFile = file.toString().replace('../src/config', 'lost-pixel');

    fs.writeFileSync(
      path.join(process.cwd(), './lostpixel.config.ts'),
      modifiedFile,
    );
    log.process('info', '✅ Config successfully initialized');
  } else {
    await configure();

    if (config.generateOnly) {
      log.process('info', `🚀 Starting Lost Pixel in 'generateOnly' mode`);

      await runner();
    } else {
      log.process('info', `🚀 Starting Lost Pixel in 'platform' mode`);

      const apiToken = await getPlatformApiToken();

      if (commandArgs.includes('finalize')) {
        await sendFinalizeToAPI(apiToken);
      } else {
        await platformRunner(apiToken);
      }
    }
  }
})();
