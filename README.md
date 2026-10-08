# Zerostel for Claude Code: the plugin repository

[Zerostel](https://github.com/zerostel/zerostel) records every step Claude Code takes and snapshots the project around each one, shell commands included, so you can see what changed and put the files back. This repository holds it as a plugin for Anthropic's plugin directory.

- **[`plugin/`](plugin)** is the plugin: what users install, and all they install. Its [README](plugin/README.md) says what it does and everything it runs, reads and writes.
- **`scripts/release.mjs`** and **`.github/`** are for maintainers and are not part of the plugin.

Zerostel's source code, issues and documentation are at [zerostel/zerostel](https://github.com/zerostel/zerostel). Please report problems there, and vulnerabilities privately as [SECURITY.md](SECURITY.md) says.

## Where the files come from

Nothing in `plugin/` is built here. `plugin/dist/cli.js`, `plugin/hooks/hooks.json` and `plugin/LICENSE` are the files of the npm package [zerostel](https://www.npmjs.com/package/zerostel) at the version in `plugin/.claude-plugin/plugin.json`, byte for byte. The skill is the package's skill with one change: it runs the plugin's own copy of Zerostel instead of asking for a global install.

`scripts/release.mjs` checks a release before taking anything from it, and checks this repository against it:

```bash
node scripts/release.mjs 0.3.0
```

It installs the package with `--ignore-scripts` into a temporary folder, runs `npm audit signatures` (the registry's signature and the provenance attestation), checks that the provenance names that version's tag in [zerostel/zerostel's release workflow](https://github.com/zerostel/zerostel/blob/main/.github/workflows/release.yml), and compares every file. The **Verify** workflow runs it on every change.

## After each Zerostel release

Actions → **Update from npm** → Run workflow with the version. It runs `scripts/release.mjs <version> --write`, pushes the result to a branch `update/<version>` and prints the link for a pull request. A branch pushed by a workflow doesn't start other workflows, so run **Verify** on it before merging. The directory picks up the new commit on `main`.

## License

Apache-2.0, like Zerostel. See [LICENSE](LICENSE).
