# usage-band

A Claude Code mod that shows a usage band above the prompt:

- **5-hour and 7-day limits**: percent used and time until reset
- **Tokens**: input and output for the session, subagents included
- **Context window**: how full it is
- **Session cost**: at API list price (not what a subscription bills)

Works in the terminal and in the Claude desktop app's Code tab.

## Install

Requires Claude Code **2.1.286 or newer** (check with `claude --version`, update with `claude update`) and Node.js on your PATH (used to total tokens from the session transcript).

```bash
claude plugin marketplace add MoonZhe/usage-band
claude plugin install usage-band@usage-band
```

Start a new session (or restart the desktop app) and the band appears above the prompt.

## Update

```bash
claude plugin marketplace update usage-band
claude plugin update usage-band@usage-band
```

## Uninstall

```bash
claude plugin uninstall usage-band@usage-band
```

## Notes

- Rate limits only arrive with API responses, so each session writes its latest reading to `~/.claude/usage-band/limits.json` and every session shows the newest one. An idle or resumed session stays current that way.
- Nothing leaves your machine: the mod only reads your own session data and that local file.

## Credits

Inspired by an idea from the Claude Code community. Built with Claude Code.

## License

[MIT](LICENSE)
