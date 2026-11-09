import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { section, stringArray, stringField, text } from './manifest.mjs';
import { repositoryRoot } from './dependency-root.mjs';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function run(command, args = [], options = {}) {
  if (command === 'silk') command = process.env.SILK || 'silk';
  const result = spawnSync(command, args.map(String), { cwd: root, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited ${result.status ?? result.signal}`);
  return result;
}
export function hostTarget() {
  const arch = { arm64: 'aarch64', x64: 'x86_64' }[process.arch];
  const platform = { darwin: 'apple-darwin', linux: 'unknown-linux-gnu', win32: 'pc-windows-msvc' }[process.platform];
  if (!arch || !platform) throw new Error(`Unsupported host ${process.platform}/${process.arch}`);
  return `${arch}-${platform}`;
}
function prepareWindows(runtimeDirectory) {
  const result = run('pwsh', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(repositoryRoot('lib-native'), 'scripts/prepare-windows.ps1'), '-Json',
    ...(process.env.SILK_CLANG ? ['-Clang', process.env.SILK_CLANG] : []),
    ...(runtimeDirectory ? ['-RuntimeDirectory', runtimeDirectory] : [])], { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });
  const prepared = JSON.parse(result.stdout);
  process.env.PATH = [join(prepared.dawn, 'bin'), prepared.dxc, join(prepared.glfw, 'lib-vc2022'), process.env.PATH].join(delimiter);
}
export function build(packagePath, { release = false, wasm = false } = {}) {
  const absolute = resolve(root, packagePath);
  const manifest = absolute.endsWith('silk.toml') ? absolute : join(absolute, 'silk.toml');
  const name = stringField(section(text(manifest), 'package'), 'name');
  if (!name) throw new Error(`No package name: ${manifest}`);
  const target = wasm ? 'wasm32-unknown-unknown' : hostTarget();
  if (!wasm && process.platform === 'win32') {
    // Populate the pinned cache before loading native SDK setup, before linking.
    run('silk', ['check', '--manifest-path', manifest]);
    prepareWindows();
  }
  run('silk', ['build', '--manifest-path', manifest, '--target', target, ...(release ? ['--release'] : [])]);
  const filename = name + (!wasm && process.platform === 'win32' ? '.exe' : '');
  // Published inspector packages emit artifacts in their own lib-ui workspace.
  const bases = new Set([dirname(manifest)]);
  for (let directory = dirname(dirname(manifest)); ; directory = dirname(directory)) {
    const workspaceManifest = join(directory, 'silk.toml');
    if (existsSync(workspaceManifest)) {
      const members = stringArray(section(text(workspaceManifest), 'workspace'), 'members');
      if (members.some(member => resolve(directory, member, 'silk.toml') === manifest)) bases.add(directory);
    }
    if (dirname(directory) === directory) break;
  }
  const candidates = [...bases].map(base => join(base, 'build', 'llvm', target, release ? 'release' : 'debug', filename)).filter(existsSync);
  if (candidates.length !== 1) throw new Error(`Expected one artifact for ${name}; found ${candidates.join(', ') || 'none'}`);
  if (!wasm && process.platform === 'win32') prepareWindows(dirname(candidates[0]));
  return candidates[0];
}
