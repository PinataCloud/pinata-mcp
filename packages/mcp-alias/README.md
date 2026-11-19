# @pinata/mcp

> **This package is an alias of [`pinata-mcp`](https://www.npmjs.com/package/pinata-mcp).**
> `npx @pinata/mcp` and `npx pinata-mcp` run the same server.

It installs `pinata-mcp` and runs its server with the arguments and environment you give it. New `pinata-mcp` 0.x releases reach it without a new release of this package.

- Docs: https://docs.pinata.cloud/tools/mcp/overview
- Tools, configuration and examples: https://github.com/PinataCloud/pinata-mcp#readme

Requires Node.js 20 or newer.

## Usage

**Claude Code**

```bash
claude mcp add pinata \
  -e PINATA_JWT=<YOUR_JWT> -e GATEWAY_URL=example.mypinata.cloud \
  -- npx -y @pinata/mcp /path/to/allowed/directory
```

**Claude Desktop** (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "pinata": {
      "command": "npx",
      "args": ["-y", "@pinata/mcp", "/path/to/allowed/directory"],
      "env": {
        "PINATA_JWT": "<YOUR_JWT>",
        "GATEWAY_URL": "example.mypinata.cloud"
      }
    }
  }
}
```

The directory arguments are optional. Without them, the server only allows access to the current working directory.
