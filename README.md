# pinata-mcp
[![smithery badge](https://smithery.ai/badge/@PinataCloud/pinata-mcp)](https://smithery.ai/server/@PinataCloud/pinata-mcp)

A Model Context Protocol (MCP) server that provides Claude with access to Pinata. This integration allows Claude to interact with Public and Private IPFS through Pinata's API.

## Setup

### Prerequisites

- Node.js 18+ installed
- A Pinata account with an API key (JWT)

### Installation

Installation will depend on whether you are using Claude Code or Claude Desktop

**Claude Code**

Run `claude mcp add` and follow the prompts with the following information:

```
Server Name: pinata
Server Scope: Project or Global
Server Command: npx
Command Arguments: pinata-mcp /path/to/allowed/directories /another/path/to/allowed/directories
Environment Variables: PINATA_JWT=<YOUR_JWT>,GATEWAY_URL=example.mypinata.cloud
```

**Claude Desktop**

Add the following config to `claude_desktop_config.json`

```json
{
  "mcpServers": {
    "pinata": {
      "command": "npx",
      "args": [
        "pinata-mcp",
        "/path/to/allowed/directory"
      ],
      "env": {
        "PINATA_JWT": "<YOUR_JWT>",
        "GATEWAY_URL": "example.mypinata.cloud"
      }
    }
  }
}
```

### Installing via Smithery

To install Pinata MCP for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@PinataCloud/pinata-mcp):

```bash
npx -y @smithery/cli install @PinataCloud/pinata-mcp --client claude
```

## Usage

To start using the MCP start up Claude Code with the command `claude` or start Claude Desktop. Below are the available operations:

### File Operations

- **Upload files** to Pinata (public or private IPFS)
- **Search files** by name, CID, or mime type
- **Get file details** by ID
- **Update file metadata** including name and key-values
- **Delete files** from Pinata

### Group Operations

- **List groups** with optional filtering
- **Create groups** for organizing files
- **Get group details** by ID
- **Update group information**
- **Delete groups**
- **Add/remove files** to/from groups

### Content Access

- **Create private download links** for accessing private files
- **Fetch content from IPFS gateway** and optionally save locally

## Example Prompts for Claude

Here are some examples of how to instruct Claude to use pinata-mcp:

```
Upload an image to Pinata:
"Please upload the file at ~/Pictures/example.jpg to my Pinata account as a private file named 'My Example Image'"

Search for files:
"Search my Pinata account for all PNG files"

Create a group and add files:
"Create a new group called 'Project Assets' on Pinata, then find all my JSON files and add them to this group"

Download content from IPFS:
"Fetch the content with CID QmX... from IPFS and save it to my Downloads folder"
```

## Questions

Send us an [email](mailto:steve@pinata.cloud) with any issues you may encounter!
