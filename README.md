# pinata-mcp

A Model Context Protocol (MCP) server that provides Claude with access to Pinata. This integration allows Claude to interact with Public and Private IPFS through Pinata's API.

## Setup

### Prerequisites

- Node.js 20+ installed (uploads use `File` and `fs.openAsBlob`, which Node.js 18 lacks)
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
| `uploadFile` | Upload a file to Pinata (public or private IPFS). Files over 90 MiB use resumable uploads and can be any size. A large upload returns once Pinata has registered the file, which can take several minutes per GiB; the server reports progress every 15 seconds to clients that ask for it. If your client times out first, pass `waitForCid: false` to return once the bytes are stored, then find the file with `searchFiles` |
| `getUploadLimits` | Get your account's upload limits: `folder_max_files`, the most files one folder can hold (30,000 unless the account has its own limit) |
| `searchFiles` | Search files by name, CID, or MIME type |
| `getFileById` | Get detailed file information by ID |
| `updateFile` | Update file metadata (name, key-values) |
| `deleteFile` | Delete a file from Pinata |

### Folder Operations

| Tool | Description |
|------|-------------|
| `uploadFolder` | Upload a local directory as one folder with one CID, subdirectories included. Use it instead of `uploadFile` whenever the content is a directory (a website, a dataset, a set of images). Each file is its own resumable upload, several at a time (`concurrency`, default 4), each retried on its own. Accepts `network`, `name` (defaults to the directory's name), `group_id`, `keyvalues`, `cidVersion`, `folderId` (upload into an existing folder) and `paths` (only these files, relative to the directory). Reports progress per file to clients that ask for it |
| `listFolder` | List one level of a folder: files and subdirectories with names, paths, sizes and CIDs, the folder's CID and root name, and whether files can still be added (`appendable`, `appendable_until`). Accepts `path` for a subdirectory, `limit` and `pageToken` |

`uploadFolder` uploads every regular file under the directory, hidden files and empty files included. Paths in the folder are relative to the directory, so the folder's CID is the one `ipfs add -r --cid-version 1 --raw-leaves <directory>` computes (as long as the directory holds no empty subdirectories or symlinks, which a folder doesn't keep). A symlink to a file is followed only when its target is inside the allowed directories; symlinks to directories, symlinks leaving the allowed directories, empty directories, and names holding `%` are skipped and listed in the result. An empty directory, or a directory outside the allowed directories, is refused.

A folder holds at most `folder_max_files` files (`getUploadLimits`). Upload a directory with more as several folders: one `uploadFolder` call per subset of its files, each with its own `name` and `paths`.

A successful upload returns the folder's id, name, CID, file count, total size and duration:

```json
{
  "id": "019a8b2c-4d5e-7f60-8a1b-2c3d4e5f6a7b",
  "name": "site",
  "cid": "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
  "network": "public",
  "files_uploaded": 25,
  "files_in_folder": 25,
  "total_bytes": 1831186,
  "total_size": "1.7 MiB",
  "duration_seconds": 35.9
}
```

When some files fail for good, the other files stay in the folder and the result lists the failed paths with their reasons (the first 50), the folder id, and the arguments of a call that sends only the failed files again into the same folder:

```json
{
  "directory": "/path/to/allowed/directory/site",
  "network": "public",
  "name": "site",
  "folderId": "019a8b2c-4d5e-7f60-8a1b-2c3d4e5f6a7b",
  "paths": ["images/large.bin", "docs/guide.pdf"]
}
```

The same `folderId` adds files to an existing folder, as long as `name` is the folder's name (its `root` in `listFolder`) and the folder is still `appendable`; a file whose path is already in the folder replaces it. For example, to add `new/report.pdf` from the same directory: `{ "directory": "/path/to/allowed/directory/site", "folderId": "…", "paths": ["new/report.pdf"] }`.

`listFolder` lists one level at a time:

```json
{ "folderId": "019a8b2c-4d5e-7f60-8a1b-2c3d4e5f6a7b", "path": "images/2024", "limit": 100 }
```

returns the folder's `cid`, `root`, `appendable`, `appendable_until`, `entries` (each with `type` `file` or `directory`, `name`, `path`, and for files `size`, `cid` and `mime_type`) and `next_page_token`, to pass as `pageToken` for the next page (null on the last).

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

The server reads `PINATA_JWT` and `GATEWAY_URL` from its environment; it does not load a `.env` file. Pass them in the MCP config (step 4), with `-e` for the MCP Inspector, or export them in your shell:

```bash
export PINATA_JWT=your_pinata_jwt_here
export GATEWAY_URL=your-gateway.mypinata.cloud
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

## Releasing

Publishing a GitHub Release publishes the package to npm through the `Release` workflow (`.github/workflows/release.yml`).

1. **Bump the version** in `package.json` (and `package-lock.json`) and push it to `main`: `npm version patch|minor|major --no-git-tag-version`.
2. **Create a GitHub Release** with the tag `v<version>` (e.g. `v0.3.1`) on that commit. The workflow:
   - checks that the tag matches `package.json` and that the version isn't on npm yet
   - waits for approval of the `npm-publish` environment, which only `main` and `v*` tags can deploy to
   - builds and publishes with [trusted publishing](https://docs.npmjs.com/trusted-publishers) and provenance (no npm token). Releases marked as pre-release go to the `next` dist-tag, everything else to `latest`.

```bash
npm version patch --no-git-tag-version
git commit -am "chore: release 0.3.1" && git push
gh release create v0.3.1 --generate-notes          # add --prerelease for a "next" release
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

Upload a folder:
"Upload the folder ~/projects/site to Pinata as a public folder named 'site', then list its images directory"

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
