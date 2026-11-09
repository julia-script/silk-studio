#!/usr/bin/env node
// Preserve generator output byte-for-byte; format only hand-maintained sources.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { root, run } from './build.mjs';
const files = ['silk.toml'];
const embedded = new Set(['pixels.silk', 'tweet_asset.silk']);
function collect(directory) {
  for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
    if (entry.name.startsWith('.') || ['build', 'node_modules'].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) collect(path);
    else if (entry.name === 'silk.toml' || (entry.name.endsWith('.silk') && !entry.name.startsWith('generated_') && !embedded.has(entry.name))) files.push(path);
  }
}
collect('modules');
run('silk', ['format', '--check', ...files.sort()]);
