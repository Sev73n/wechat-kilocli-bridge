#!/usr/bin/env bun

import {
  checkForUpdate,
  getCurrentVersion,
  fetchLatestVersion,
  compareVersions,
} from "../utils/version-checker.ts";

async function main(): Promise<void> {
  const currentVersion = await getCurrentVersion();

  console.log(`CLI WeChat Bridge Version Check`);
  console.log(`Current version: v${currentVersion}\n`);

  console.log(`Checking for updates...`);

  const versionInfo = await checkForUpdate(true); // 强制检查

  if (!versionInfo) {
    console.log(`ERROR: Unable to check for updates, please check your network connection`);
    process.exit(1);
  }

  if (!versionInfo.hasUpdate) {
    console.log(`OK: Already up to date (v${versionInfo.latest})`);
    process.exit(0);
  }

  console.log(`[New Version Available] v${versionInfo.latest}`);
  console.log(`Current version: v${versionInfo.current}\n`);

  console.log(`Update instructions:`);
  console.log(`   cd wechat-kilocli-bridge`);
  console.log(`   git pull`);
  console.log(`   npm install\n`);

  console.log(`For more information:`);
  console.log(`   http://git.73oc.local/73/wechat-kilocli-bridge`);
}

main().catch((error) => {
  console.error(`Error checking for updates: ${error.message}`);
  process.exit(1);
});
