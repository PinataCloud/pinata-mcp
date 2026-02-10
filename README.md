[![MseeP.ai Security Assessment Badge](https://mseep.net/pr/pinatacloud-pinata-mcp-badge.png)](https://mseep.ai/app/pinatacloud-pinata-mcp)

# pinata-mcp

A Model Context Protocol (MCP) server that provides Claude with access to Pinata. This integration allows Claude to interact with Public and Private IPFS through Pinata's API.

## Setup

### Prerequisites

- Node.js 18+ installed
- A Pinata account with an API key (JWT)
- A Pinata Gateway URL

### Installation

Installation will depend on whether you are using Claude Code or Claude Desktop.

**Claude Code**

Run `claude mcp add` and follow the prompts with the following information:

```
Server Name: pinata
Server Scope: Project or Global
Server Command: npx
Command Arguments: pinata-mcp /path/to/allowed/directory
Environment Variables: PINATA_JWT=<YOUR_JWT>,GATEWAY_URL=example.mypinata.cloud
```

**Claude Desktop**

Add the following config to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "pinata": {
      "command": "npx",
      "args": [
        "pinata-mcp",
        "/path/to/allowed/directory",
        "/another/allowed/directory"
      ],
      "env": {
        "PINATA_JWT": "<YOUR_JWT>",
        "GATEWAY_URL": "example.mypinata.cloud"
      }
    }
  }
}
```

> **Note:** The directory arguments are optional. If not provided, the server will only allow access to the current working directory. You can specify multiple directories to allow file access from multiple locations.

## Available Tools

### Authentication

| Tool | Description |
|------|-------------|
| `testAuthentication` | Verify that your Pinata JWT is valid and working |

### File Operations

| Tool | Description |
|------|-------------|
| `uploadFile` | Upload a file to Pinata (public or private IPFS) |
| `searchFiles` | Search files by name, CID, or MIME type |
| `getFileById` | Get detailed file information by ID |
| `updateFile` | Update file metadata (name, key-values) |
| `deleteFile` | Delete a file from Pinata |

### Content Access

| Tool | Description |
|------|-------------|
| `createLink` | Create a gateway link for public or private files |
| `createPrivateDownloadLink` | Generate a temporary download link for private files |
| `fetchFromGateway` | Fetch content from IPFS via Pinata gateway |

### Group Operations

| Tool | Description |
|------|-------------|
| `listGroups` | List groups with optional filtering |
| `createGroup` | Create a new group for organizing files |
| `getGroup` | Get group details by ID |
| `updateGroup` | Update group information |
| `deleteGroup` | Delete a group |
| `addFileToGroup` | Add a file to a group |
| `removeFileFromGroup` | Remove a file from a group |

### x402 Payment Instructions

Tools for content monetization using the x402 protocol:

| Tool | Description |
|------|-------------|
| `createPaymentInstruction` | Create payment requirements for gated content |
| `listPaymentInstructions` | List/filter existing payment instructions |
| `getPaymentInstruction` | Get details of a specific payment instruction |
| `updatePaymentInstruction` | Modify payment instruction settings |
| `deletePaymentInstruction` | Remove a payment instruction |
| `listPaymentInstructionCids` | List CIDs associated with a payment instruction |
| `addCidToPaymentInstruction` | Associate a CID with a payment instruction |
| `removeCidFromPaymentInstruction` | Remove a CID association |

### CID Signatures

Tools for cryptographic content verification using EIP-712 signatures:

| Tool | Description |
|------|-------------|
| `addSignature` | Add a cryptographic signature to a CID |
| `getSignature` | Get signature details by CID |
| `deleteSignature` | Remove a signature |

### Signed Upload URLs

| Tool | Description |
|------|-------------|
| `createSignedUploadUrl` | Create a presigned URL for client-side uploads |

### Pin by CID

| Tool | Description |
|------|-------------|
| `pinByCid` | Pin an existing CID from the IPFS network |
| `queryPinRequests` | Query the status of pin requests |
| `cancelPinRequest` | Cancel a pending pin request |

### Vectorize (AI/Semantic Search)

| Tool | Description |
|------|-------------|
| `vectorizeFile` | Vectorize a file for semantic search |
| `deleteFileVectors` | Delete vectors for a file |
| `queryVectors` | Query vectorized files using semantic search |

### Utilities

| Tool | Description |
|------|-------------|
| `listAllowedDirectories` | List directories the server can access for file operations |

## Local Development

To test the MCP server locally during development:

### 1. Clone and install dependencies

```bash
git clone https://github.com/PinataCloud/pinata-mcp.git
cd pinata-mcp
npm install
```

### 2. Build the project

```bash
npm run build
```

### 3. Set up environment variables

Create a `.env` file in the project root (optional, you can also pass these in the MCP config):

```
PINATA_JWT=your_pinata_jwt_here
GATEWAY_URL=your-gateway.mypinata.cloud
```

### 4. Configure Claude to use the local build

**Claude Code**

Run `claude mcp add` with the local path:

```
Server Name: pinata-dev
Server Scope: Project
Server Command: node
Command Arguments: /path/to/pinata-mcp/dist/index.js /path/to/allowed/directory
Environment Variables: PINATA_JWT=<YOUR_JWT>,GATEWAY_URL=example.mypinata.cloud
```

**Claude Desktop**

Update `claude_desktop_config.json` to point to your local build:

```json
{
  "mcpServers": {
    "pinata-dev": {
      "command": "node",
      "args": [
        "/path/to/pinata-mcp/dist/index.js",
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

### 5. Testing changes

After making code changes:

1. Rebuild: `npm run build`
2. Restart Claude Code or Claude Desktop to pick up the changes

### Testing with MCP Inspector

Use the [MCP Inspector](https://github.com/modelcontextprotocol/inspector) to test the server:

**Web UI (interactive debugging)**

```bash
npx @modelcontextprotocol/inspector \
  -e PINATA_JWT=your_jwt \
  -e GATEWAY_URL=your-gateway.mypinata.cloud \
  -- node dist/index.js
```

This opens a browser UI where you can interactively list tools, call them with parameters, and inspect responses.

**CLI mode (for scripting/CI)**

```bash
# List all available tools
npx @modelcontextprotocol/inspector --cli --method tools/list \
  -e PINATA_JWT=your_jwt \
  -e GATEWAY_URL=your-gateway.mypinata.cloud \
  -- node dist/index.js

# Call a specific tool
npx @modelcontextprotocol/inspector --cli --method tools/call \
  --tool-name testAuthentication \
  -e PINATA_JWT=your_jwt \
  -e GATEWAY_URL=your-gateway.mypinata.cloud \
  -- node dist/index.js
```

## Example Prompts for Claude

```
Test my Pinata connection:
"Test my Pinata authentication to make sure everything is working"

Upload an image to Pinata:
"Upload this image to my Pinata account as a private file named 'My Example Image'"

Search for files:
"Search my Pinata account for all PNG files"

Create a group and add files:
"Create a new group called 'Project Assets' on Pinata, then find all my JSON files and add them to this group"

Fetch content from IPFS:
"Fetch the content with CID QmX... from IPFS"

Create a payment instruction for content monetization:
"Create a payment instruction called 'Premium Content' that requires 0.01 USDC on Base to access"

Pin an existing CID:
"Pin the CID bafkreih5aznjvttude6c3wbvqeebb6rlx5wkbzyppv7garjiubll2ceym4 to my account"

Vectorize files for AI search:
"Vectorize the file with ID abc123 so I can search it semantically"

Query vectorized content:
"Search my vectorized files in group xyz for 'machine learning concepts'"
```
