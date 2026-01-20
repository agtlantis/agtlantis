/**
 * E2E Test Setup
 *
 * Loads environment variables in a 4-stage chain:
 * 1. .env - Base defaults (can be tracked in git)
 * 2. .env.test - Test-specific settings (can be tracked in git)
 * 3. .env.local - Local overrides (git ignored)
 * 4. .env.test.local - Local test secrets like API keys (git ignored)
 *
 * Later files override earlier ones.
 */

import { config } from 'dotenv';
import * as path from 'path';

const packageRoot = path.resolve(__dirname, '..');

// Load in order: base -> test -> local -> test.local
// Each subsequent file overrides previous values
const envFiles = ['.env', '.env.test', '.env.local', '.env.test.local'];

for (const file of envFiles) {
    config({
        path: path.join(packageRoot, file),
        override: true,
    });
}
