# @inrent/cli

Command-line interface for [INRENT](https://inrent.ai): browse models, manage keys, check usage and logs, and send test requests.

```bash
npm install -g @inrent/cli
inrent login            # prompts for your key (hidden) and stores it in ~/.config/inrent/config.json (0600)
inrent status
inrent models --available
inrent test "Say hello"
inrent playground -m inrent/auto
```

Every command supports `--json`. See the full reference at https://inrent.ai/docs/cli.

GPU Cloud commands (`inrent gpu …`, `inrent deploy`) are placeholders until GPU Cloud launches: they print a notice and exit with code 2 without provisioning anything.

## Development

```bash
pnpm --filter @inrent/cli dev -- models     # run from source
pnpm --filter @inrent/cli test
pnpm --filter @inrent/cli build             # bundles to dist/index.js
```

License: Apache-2.0
