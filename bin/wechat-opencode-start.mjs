#!/usr/bin/env node

import { main } from "../src/companion/local-companion-start.ts";

await main(["--adapter", "opencode", ...process.argv.slice(2)]);
