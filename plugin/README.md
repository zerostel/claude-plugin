# Zerostel for Claude Code

Rewind any AI agent to point zero. This plugin records every step Claude Code takes in a project and snapshots the project's files around each one, shell commands included, so you can see what changed and put the files back. Claude Code's own `/rewind` doesn't track files changed through Bash; Zerostel does.

This folder is the plugin as Anthropic's plugin directory installs it, from [zerostel/claude-plugin](https://github.com/zerostel/claude-plugin). Zerostel itself, its source code, issues and documentation live at [zerostel/zerostel](https://github.com/zerostel/zerostel).

## What you get

- **A timeline** of each session: prompts, tool calls, commands, files changed, time and tokens.
- **Rewinds**: undo Claude's last turn, go back to any step, or all the way to point zero, where the session started. Every rewind can itself be undone.
- **Checks**: the tests and builds Claude ran, tied to the code they ran on, so a pass on code that changed since shows as out of date, with the tests that failed named.
- **Guardrails** you write in `~/.zerostel/policy.json` that block a tool call or make Claude ask you first. With no such file, nothing is blocked.
- **A skill** that lets you just ask: "what did you change?", "undo your last turn", "were the tests run on this code?". Claude shows a preview and asks before it changes any file.

## Requirements

Node 20 or newer and git, both on the `PATH`. The hooks run `node`, and snapshots are stored with `git`. Claude Code's native installer doesn't bring Node, so install it if `node --version` doesn't work in a terminal. Windows, macOS and Linux.

The plugin is made for Claude Code (terminal, IDE extensions, the desktop app's Code tab). In chat on claude.ai there's nothing for it to record. It hasn't been tested in Cowork.

## What it runs, reads and writes

On each of Claude Code's hook events (`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `Stop`, `SessionEnd`) the plugin runs one command:

```
node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" hook claude-code
```

- **Reads** the event Claude Code passes it (the session, the project folder, your prompt, the tool and its input, the end of the tool's output), the session transcript for token counts, the project's files, and `~/.zerostel/policy.json` if you made one.
- **Writes** only to `~/.zerostel` (or `ZEROSTEL_DIR` if you set it), readable only by you: the session log, with secrets it recognizes masked in tool output, and snapshots of the project's files in a separate git repository. Your project's own `.git` is never touched. Nothing is written into the project unless you ask for a rewind, and a rewind always shows what it will change first.
- **Runs** `git` for the snapshots. On a large project the first snapshot may finish in a background process.
- **Network:** none. No telemetry, no account, nothing is sent anywhere. The one server in the program is `zerostel ui`, which serves the timeline on 127.0.0.1 to your own browser, and only when you run it.
- **Can stop a tool call** only if a rule in your `policy.json` says so.

What an automated review of this plugin points out, and what it is:

- **The `PreToolUse` hook answers permission questions.** When none of your own `policy.json` rules applies, it prints nothing, so Claude Code asks you about tool calls exactly as it would without the plugin. When a rule applies, it answers `ask` or `deny`. It never answers `allow`, so it can't approve a tool call Claude Code would otherwise ask you about, and it never changes a tool's input. Its matcher is `*` because every tool call is recorded.
- **It reads files like `.env` and `.npmrc`.** Snapshots include small files that git ignores, `.env` and `.npmrc` first, so a rewind can bring back a config file the agent deleted or overwrote. These copies stay in `~/.zerostel` with everything else, are never sent anywhere or used to sign in to anything, and shareable reports leave such files out.
- **"Tokens"** in `dist/cli.js` (`fmtTokens` and others) are the language model's token counts that the timeline shows, not credentials. The program uses no credential and has no network client; its one server is `zerostel ui`, on 127.0.0.1.

`dist/cli.js` is Zerostel's whole program in one readable JavaScript file with no dependencies. It isn't built here: it is the `dist/cli.js` of the npm package [zerostel](https://www.npmjs.com/package/zerostel) at the version in `.claude-plugin/plugin.json`, byte for byte, as are `hooks/hooks.json` (the package's `hooks/claude-code.json`) and `LICENSE`. The skill is the package's skill with one change, made by `scripts/release.mjs`: it runs this copy of Zerostel instead of asking you to install one.

## Check it yourself

The npm package is built by [zerostel/zerostel's release workflow](https://github.com/zerostel/zerostel/blob/main/.github/workflows/release.yml) and published with npm provenance. `scripts/release.mjs`, in the repository but not in this folder, checks that, then compares the plugin with the package:

```bash
node scripts/release.mjs 0.3.0
```

It installs the package with `--ignore-scripts` into a temporary folder, runs `npm audit signatures` (the registry's signature and the provenance attestation), checks that the provenance names this version's tag in zerostel/zerostel's release workflow, and compares every file above. The `Verify` workflow runs it on every change. By hand: `sha256sum dist/cli.js`, and the same for `package/dist/cli.js` in `npm pack zerostel@<version>`.

## Using it

Ask Claude in the session: "show me the timeline", "what did the last turn change?", "undo that", "go back to before step 4", "did the tests pass on this code?". For the same from a terminal, install the command line tool (`npm install -g zerostel`) and see [the commands](https://github.com/zerostel/zerostel/blob/main/docs/commands.md). If you already set Zerostel up with `zerostel install`, you don't need this plugin as well; with both, each event is still recorded once.

Removing the plugin stops the recording. What was recorded stays in `~/.zerostel` until you delete it.

## Security

Please report vulnerabilities privately: see [SECURITY.md](SECURITY.md).

## License

Apache-2.0, like Zerostel. See [LICENSE](LICENSE).
