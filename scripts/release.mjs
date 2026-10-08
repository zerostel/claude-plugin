// Brings this plugin in line with a released zerostel npm package, or checks
// that it is. Before taking anything from the package it checks where the
// package came from: the registry's signature and npm provenance saying it was
// built by zerostel/zerostel's release workflow from that version's tag.
//
//   node scripts/release.mjs 0.3.0           check this repository against 0.3.0
//   node scripts/release.mjs 0.3.0 --write   copy 0.3.0's files in
//
// Needs Node 22 or newer and npm. Nothing from the package is run: it is
// installed with --ignore-scripts and only its files are read.

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE = { repository: 'https://github.com/zerostel/zerostel', path: '.github/workflows/release.yml' };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [version, mode] = process.argv.slice(2);
const write = mode === '--write';

function fail(message) {
  console.error(`release.mjs: ${message}`);
  process.exit(1);
}
if (!/^\d+\.\d+\.\d+$/.test(version ?? '') || (mode && !write)) fail('usage: node scripts/release.mjs <version> [--write]');

const npm = (args, cwd) =>
  execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });

// 1. the package, installed where it can't run anything
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zerostel-plugin-'));
try {
  fs.writeFileSync(path.join(tmp, 'package.json'), '{ "private": true }\n');
  npm(['install', '--ignore-scripts', '--no-audit', '--no-fund', '--save-exact', `zerostel@${version}`], tmp);
  const pkg = path.join(tmp, 'node_modules', 'zerostel');
  const installed = JSON.parse(fs.readFileSync(path.join(pkg, 'package.json'), 'utf8')).version;
  if (installed !== version) fail(`npm installed ${installed}, not ${version}`);

  // 2. the registry's signature and the provenance signature check out
  const audit = npm(['audit', 'signatures'], tmp);
  if (!/1 package has a verified registry signature/.test(audit)) fail(`no verified registry signature:\n${audit}`);
  if (!/1 package has a verified attestation/.test(audit)) fail(`no verified provenance attestation:\n${audit}`);

  // 3. and the provenance says what it should: this package, built from this
  //    version's tag by zerostel/zerostel's release workflow
  const integrity = JSON.parse(fs.readFileSync(path.join(tmp, 'package-lock.json'), 'utf8')).packages['node_modules/zerostel'].integrity;
  const sha512 = Buffer.from(integrity.replace(/^sha512-/, ''), 'base64').toString('hex');
  const res = await fetch(`https://registry.npmjs.org/-/npm/v1/attestations/zerostel@${version}`);
  if (!res.ok) fail(`no attestations for zerostel@${version} (HTTP ${res.status})`);
  const { attestations } = await res.json();
  const slsa = attestations.find((a) => a.predicateType === 'https://slsa.dev/provenance/v1');
  if (!slsa) fail('no SLSA provenance');
  const statement = JSON.parse(Buffer.from(slsa.bundle.dsseEnvelope.payload, 'base64').toString('utf8'));
  const subject = statement.subject?.[0];
  if (subject?.name !== `pkg:npm/zerostel@${version}` || subject?.digest?.sha512 !== sha512) fail('the provenance is for a different package');
  const workflow = statement.predicate?.buildDefinition?.externalParameters?.workflow;
  if (workflow?.repository !== SOURCE.repository || workflow?.path !== SOURCE.path || workflow?.ref !== `refs/tags/v${version}`) {
    fail(`built by ${JSON.stringify(workflow)}, not ${SOURCE.repository}/${SOURCE.path} at v${version}`);
  }

  // 4. the files this plugin carries
  const read = (rel) => fs.readFileSync(path.join(pkg, rel));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'plugin.json'), 'utf8'));
  const expected = {
    'dist/cli.js': read('dist/cli.js'),
    'hooks/hooks.json': read('hooks/claude-code.json'),
    'skills/zerostel/SKILL.md': Buffer.from(pluginSkill(read('skills/zerostel/SKILL.md').toString('utf8'))),
    LICENSE: read('LICENSE'),
    '.claude-plugin/plugin.json': Buffer.from(`${JSON.stringify({ ...manifest, version }, null, 2)}\n`),
  };
  const differ = [];
  for (const [rel, want] of Object.entries(expected)) {
    const file = path.join(root, rel);
    const have = fs.existsSync(file) ? fs.readFileSync(file) : null;
    if (have?.equals(want)) continue;
    differ.push(rel);
    if (write) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, want);
    }
  }
  const sha256 = crypto.createHash('sha256').update(expected['dist/cli.js']).digest('hex');
  if (!write && differ.length) fail(`not the files of zerostel@${version}: ${differ.join(', ')}`);
  console.log(`zerostel@${version}: signed by the registry, built by ${SOURCE.repository} at v${version}`);
  console.log(`dist/cli.js sha256 ${sha256}`);
  console.log(write ? (differ.length ? `updated: ${differ.join(', ')}` : 'already up to date') : 'this repository matches it');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

/**
 * The package's skill, for this plugin: the plugin carries Zerostel itself,
 * so the skill runs that copy instead of asking for a global install.
 */
function pluginSkill(skill) {
  const cli = 'node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js"';
  const lines = skill.split('\n');
  const out = [];
  for (const line of lines) {
    out.push(line);
    const allowed = /^(\s*- Bash\()zerostel (.*\))$/.exec(line);
    if (allowed) out.push(`${allowed[1]}${cli} ${allowed[2]}`);
  }
  let text = out.join('\n');
  const from = /If `zerostel` isn't on the PATH, don't run it through npx:[\s\S]*?leave\s+`zerostel install` to the user\./;
  if (!from.test(text)) fail("the package's skill changed where this script adapts it: update pluginSkill()");
  text = text.replace(
    from,
    [
      'This plugin carries Zerostel itself. Wherever these instructions say',
      `\`zerostel\`, run \`${cli}\` (for example`,
      `\`${cli} log\`), or \`zerostel\` if it's on the PATH. Don't`,
      'run it through npx: inside a project, npx prefers a copy the project itself',
      'provides, which could be anything. If there are no recordings, the plugin\'s',
      'hooks aren\'t running, usually because Node 20 or newer, or git, isn\'t on the',
      'PATH: say so, and leave fixing it to the user.',
    ].join('\n'),
  );
  return text;
}
