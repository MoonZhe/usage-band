# usage-band

A Claude Code mod that shows a usage band above the prompt.

![usage-band preview](docs/preview.svg)

*Rendered from the mod's own drawing code with sample numbers. It follows your light or dark theme.*

From left to right:

- **5h / 7d**: percent of your 5-hour and 7-day limits used, and time until each resets. The bar turns yellow then red as it fills; the tick marks how far through the window you are, so a bar ahead of its tick means you're burning faster than the window allows.
- **↑ / ↓**: input and output tokens for the session, subagents included
- **Context**: tokens in the context window, out of its size
- **$**: session cost at API list price (not what a subscription bills)

Hover a pill in the desktop app for details. In the terminal the band is drawn as colored text instead of pills. `/usage-band hide` and `/usage-band show` toggle it; `/usage-band` alone prints the readings.

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
