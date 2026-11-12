#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "fs/promises";
import { openAsBlob } from "fs";
import path from "path";
import os from "os";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PinataSDK } from "pinata";

// Command line argument parsing for allowed directories
const args = process.argv.slice(2);
const allowedDirectories: string[] = [];

// Parse allowed directories from args (if provided)
if (args.length > 0) {
  for (const dir of args) {
    const expanded = expandHome(dir);
    const normalized = normalizePath(path.resolve(expanded));
    allowedDirectories.push(normalized);
  }
}

// Path helper functions
function normalizePath(p: string): string {
  return path.normalize(p);
}

function expandHome(filepath: string): string {
  if (filepath.startsWith("~/") || filepath === "~") {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return filepath;
}

// Security: validate path is within allowed directories
async function validatePath(requestedPath: string): Promise<string> {
  // If no directories specified, allow current working directory
  const dirsToCheck =
    allowedDirectories.length > 0
      ? allowedDirectories
      : [normalizePath(process.cwd())];

  const expandedPath = expandHome(requestedPath);
  const absolute = path.isAbsolute(expandedPath)
    ? path.resolve(expandedPath)
    : path.resolve(process.cwd(), expandedPath);

  const normalizedRequested = normalizePath(absolute);

  const isAllowed = dirsToCheck.some((dir) =>
    normalizedRequested.startsWith(dir)
  );
  if (!isAllowed) {
    throw new Error(
      `Access denied - path outside allowed directories: ${absolute}`
    );
  }

  try {
    const realPath = await fs.realpath(absolute);
    const normalizedReal = normalizePath(realPath);
    const isRealPathAllowed = dirsToCheck.some((dir) =>
      normalizedReal.startsWith(dir)
    );
    if (!isRealPathAllowed) {
      throw new Error(
        "Access denied - symlink target outside allowed directories"
      );
    }
    return realPath;
  } catch (error) {
    const parentDir = path.dirname(absolute);
    try {
      const realParentPath = await fs.realpath(parentDir);
      const normalizedParent = normalizePath(realParentPath);
      const isParentAllowed = dirsToCheck.some((dir) =>
        normalizedParent.startsWith(dir)
      );
      if (!isParentAllowed) {
        throw new Error(
          "Access denied - parent directory outside allowed directories"
        );
      }
      return absolute;
    } catch {
      throw new Error(`Parent directory does not exist: ${parentDir}`);
    }
  }
}

const server = new McpServer({
  name: "Pinata",
  version: "0.2.0",
});

const PINATA_JWT = process.env.PINATA_JWT;
const GATEWAY_URL = process.env.GATEWAY_URL;

// Base headers for all requests
const getHeaders = () => {
  if (!PINATA_JWT) {
    throw new Error("PINATA_JWT environment variable is not set");
  }
  return {
    Authorization: `Bearer ${PINATA_JWT}`,
    "Content-Type": "application/json",
  };
};

// Helper for consistent error responses
const errorResponse = (error: unknown) => ({
  content: [
    {
      type: "text" as const,
      text: `Error: ${error instanceof Error ? error.message : String(error)}`,
    },
  ],
  isError: true,
});

// Helper for consistent success responses
const successResponse = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

// ============================================================================
// Authentication
// ============================================================================

server.tool(
  "testAuthentication",
  "Verify that your Pinata JWT is valid and working",
  {},
  async () => {
    try {
      const response = await fetch(
        "https://api.pinata.cloud/data/testAuthentication",
        {
          method: "GET",
          headers: getHeaders(),
        }
      );

      if (!response.ok) {
        throw new Error(
          `Authentication failed: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      return {
        content: [
          {
            type: "text",
            text: `✅ Authentication successful!\n\n${JSON.stringify(data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return errorResponse(error);
    }
  }
);

// ============================================================================
// File Operations
// ============================================================================

server.tool(
  "searchFiles",
  "Search for files in your Pinata account by name, CID, or MIME type. Returns a list of files matching the given criteria.",
  {
    network: z
      .enum(["public", "private"])
      .default("public")
      .describe("Whether to search in public or private IPFS"),
    name: z.string().optional().describe("Filter by filename"),
    cid: z.string().optional().describe("Filter by content ID (CID)"),
    mimeType: z.string().optional().describe("Filter by MIME type"),
    limit: z
      .number()
      .optional()
      .describe("Maximum number of results to return"),
    pageToken: z.string().optional().describe("Token for pagination"),
  },
  async ({ network, name, cid, mimeType, limit, pageToken }) => {
    try {
      const params = new URLSearchParams();
      if (name) params.append("name", name);
      if (cid) params.append("cid", cid);
      if (mimeType) params.append("mimeType", mimeType);
      if (limit) params.append("limit", limit.toString());
      if (pageToken) params.append("pageToken", pageToken);

      const url = `https://api.pinata.cloud/v3/files/${network}?${params.toString()}`;

      const response = await fetch(url, {
        method: "GET",
        headers: getHeaders(),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to search files: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      return successResponse(data);
    } catch (error) {
      return errorResponse(error);
    }
  }
);

server.tool(
  "getFileById",
  "Retrieve detailed information about a specific file stored on Pinata by its ID",
  {
    network: z
      .enum(["public", "private"])
      .default("public")
      .describe("Whether the file is in public or private IPFS"),
    id: z.string().describe("The unique ID of the file to retrieve"),
  },
  async ({ network, id }) => {
    try {
      const url = `https://api.pinata.cloud/v3/files/${network}/${id}`;

      const response = await fetch(url, {
        method: "GET",
        headers: getHeaders(),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to get file: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      return successResponse(data);
    } catch (error) {
      return errorResponse(error);
    }
  }
);

server.tool(
  "updateFile",
  "Update metadata for an existing file on Pinata including name and key-value pairs",
  {
    network: z
      .enum(["public", "private"])
      .default("public")
      .describe("Whether the file is in public or private storage"),
    id: z.string().describe("The unique ID of the file to update"),
    name: z.string().optional().describe("New name for the file"),
    keyvalues: z
      .record(z.any())
      .optional()
      .describe("Metadata key-value pairs to update"),
  },
  async ({ network, id, name, keyvalues }) => {
    try {
      const url = `https://api.pinata.cloud/v3/files/${network}/${id}`;

      const payload: { name?: string; keyvalues?: Record<string, unknown> } =
        {};
      if (name) payload.name = name;
      if (keyvalues) payload.keyvalues = keyvalues;

      const response = await fetch(url, {
        method: "PUT",
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to update file: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      return successResponse(data);
    } catch (error) {
      return errorResponse(error);
    }
  }
);

server.tool(
  "deleteFile",
  "Delete a file from your Pinata account by its ID",
  {
    network: z
      .enum(["public", "private"])
      .default("public")
      .describe("Whether the file is in public or private IPFS"),
    id: z.string().describe("The unique ID of the file to delete"),
  },
  async ({ network, id }) => {
    try {
      const url = `https://api.pinata.cloud/v3/files/${network}/${id}`;

      const response = await fetch(url, {
        method: "DELETE",
        headers: getHeaders(),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to delete file: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      return {
        content: [
          {
            type: "text",
            text: `✅ File deleted successfully\n\n${JSON.stringify(data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return errorResponse(error);
    }
  }
);

server.tool(
  "uploadFile",
  "Upload a file to Pinata IPFS. Provide either a file:// URI or base64-encoded content. Files over 90 MiB are sent as resumable uploads.",
  {
    resourceUri: z
      .string()
      .optional()
      .describe("The file:// URI of the file to upload (e.g., file:///path/to/file.jpg)"),
    fileContent: z
      .string()
      .optional()
      .describe("Base64-encoded file content (use this if not providing resourceUri)"),
    fileName: z
      .string()
      .optional()
      .describe("Name for the uploaded file (auto-detected from path if using resourceUri)"),
    mimeType: z
      .string()
      .optional()
      .describe("MIME type of the file (auto-detected if not provided)"),
    network: z
      .enum(["public", "private"])
      .default("public")
      .describe("Whether to upload to public or private IPFS"),
    group_id: z
      .string()
      .optional()
      .describe("ID of a group to add the file to"),
    keyvalues: z
      .record(z.string())
      .optional()
      .describe("Metadata key-value pairs for the file"),
    waitForCid: z
      .boolean()
      .optional()
      .describe(
        "Files over 90 MiB only. By default the upload waits until Pinata has registered the file and returns its full record. Set to false to return once the bytes are stored: the result then holds only cid (empty if not known yet) and size, and registration can still fail."
      ),
  },
  async ({ resourceUri, fileContent, fileName, mimeType, network, group_id, keyvalues, waitForCid }) => {
    try {
      if (!PINATA_JWT) {
        throw new Error("PINATA_JWT environment variable is not set");
      }

      let file: File;

      if (resourceUri) {
        // File path mode
        if (!resourceUri.startsWith("file://")) {
          throw new Error("resourceUri must be a file:// URI");
        }

        let filePath: string;
        if (process.platform === "win32") {
          filePath = decodeURIComponent(
            resourceUri.replace(/^file:\/\/\//, "").replace(/\//g, "\\")
          );
        } else {
          filePath = decodeURIComponent(resourceUri.replace(/^file:\/\//, ""));
        }

        // Validate path is allowed
        filePath = await validatePath(filePath);
        const name = fileName || path.basename(filePath);
        // Backed by the file on disk: large uploads are read chunk by chunk.
        const blob = await openAsBlob(filePath);
        file = new File([blob], name, { type: mimeType || getMimeType(name) });
      } else if (fileContent) {
        // Base64 content mode
        if (!fileName) {
          throw new Error("fileName is required when using fileContent");
        }
        file = new File([Buffer.from(fileContent, "base64")], fileName, {
          type: mimeType || getMimeType(fileName),
        });
      } else {
        throw new Error("Either resourceUri or fileContent must be provided");
      }

      const pinata = new PinataSDK({ pinataJwt: PINATA_JWT });
      let upload =
        network === "public"
          ? pinata.upload.public.file(file)
          : pinata.upload.private.file(file);
      if (group_id) {
        upload = upload.group(group_id);
      }
      if (keyvalues) {
        upload = upload.keyvalues(keyvalues);
      }
      if (waitForCid !== undefined) {
        upload = upload.waitForCid(waitForCid);
      }

      const data = await upload;
      // Only an upload that returned before registration lacks an id.
      const heading = data.id
        ? "✅ File uploaded successfully!"
        : "✅ File stored. Pinata is still registering it, so only its CID and size are known.";
      return {
        content: [
          {
            type: "text",
            text: `${heading}\n\n${JSON.stringify({ data }, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return errorResponse(error);
    }
  }
);

// ============================================================================
// Private Download Links
// ============================================================================

server.tool(
  "createPrivateDownloadLink",
  "Generate a temporary download link for accessing a private IPFS file from Pinata",
  {
    cid: z.string().describe("The content ID (CID) of the private file"),
    expires: z
      .number()
      .default(600)
      .describe("Expiration time in seconds (default: 600 = 10 minutes)"),
  },
  async ({ cid, expires }) => {
    try {
      if (!GATEWAY_URL) {
        throw new Error("GATEWAY_URL environment variable is not set");
      }

      const apiUrl = `https://api.pinata.cloud/v3/files/private/download_link`;
      const url = `https://${GATEWAY_URL}/files/${cid}`;
      const date = Math.floor(new Date().getTime() / 1000);

      const payload = {
        url,
        expires,
        date,
        method: "GET",
      };

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to create download link: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      const expirationTime = new Date((date + expires) * 1000).toLocaleString();

      return {
        content: [
          {
            type: "text",
            text: `✅ Private download link created!\n\nURL: ${data.data}\n\nExpires: ${expirationTime} (${expires} seconds from creation)`,
          },
        ],
      };
    } catch (error) {
      return errorResponse(error);
    }
  }
);

server.tool(
  "createLink",
  "Create a direct access link for a file stored on Pinata IPFS. For public files returns a gateway URL, for private files generates a temporary download link.",
  {
    cid: z.string().describe("The CID of the file to create a link for"),
    network: z
      .enum(["public", "private"])
      .default("public")
      .describe("Whether the file is on public or private IPFS"),
    expires: z
      .number()
      .default(600)
      .describe(
        "Expiration time in seconds for private download links (default: 600)"
      ),
  },
  async ({ cid, network, expires = 600 }) => {
    try {
      if (!GATEWAY_URL) {
        throw new Error("GATEWAY_URL environment variable is not set");
      }

      if (network === "public") {
        const fileUrl = `https://${GATEWAY_URL}/ipfs/${cid}`;
        return {
          content: [
            {
              type: "text",
              text: `✅ Public IPFS link:\n${fileUrl}`,
            },
          ],
        };
      } else {
        const filePath = `https://${GATEWAY_URL}/files/${cid}`;
        const apiUrl = `https://api.pinata.cloud/v3/files/private/download_link`;
        const date = Math.floor(new Date().getTime() / 1000);

        const payload = {
          url: filePath,
          expires,
          date,
          method: "GET",
        };

        const linkResponse = await fetch(apiUrl, {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify(payload),
        });

        if (!linkResponse.ok) {
          const errorText = await linkResponse.text();
          throw new Error(
            `Failed to create download link: ${linkResponse.status} ${linkResponse.statusText}. Response: ${errorText}`
          );
        }

        const linkData = await linkResponse.json();
        const expirationTime = new Date(
          (date + expires) * 1000
        ).toLocaleString();

        return {
          content: [
            {
              type: "text",
              text: `✅ Private IPFS temporary link:\n${linkData.data}\n\nExpires: ${expirationTime} (${expires} seconds from creation)`,
            },
          ],
        };
      }
    } catch (error) {
      return errorResponse(error);
    }
  }
);

server.tool(
  "fetchFromGateway",
  "Fetch content from Public or Private IPFS via Pinata gateway and return it",
  {
    cid: z.string().describe("The CID of the file to fetch"),
    network: z
      .enum(["public", "private"])
      .default("public")
      .describe("Whether the file is on public or private IPFS"),
  },
  async ({ cid, network }) => {
    try {
      if (!GATEWAY_URL) {
        throw new Error("GATEWAY_URL environment variable is not set");
      }

      let fileUrl: string;

      if (network === "public") {
        fileUrl = `https://${GATEWAY_URL}/ipfs/${cid}`;
      } else {
        const filePath = `https://${GATEWAY_URL}/files/${cid}`;
        const apiUrl = `https://api.pinata.cloud/v3/files/private/download_link`;
        const date = Math.floor(new Date().getTime() / 1000);
        const expires = 600;

        const payload = {
          url: filePath,
          expires,
          date,
          method: "GET",
        };

        const linkResponse = await fetch(apiUrl, {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify(payload),
        });

        if (!linkResponse.ok) {
          const errorText = await linkResponse.text();
          throw new Error(
            `Failed to create download link: ${linkResponse.status} ${linkResponse.statusText}. Response: ${errorText}`
          );
        }

        const linkData = await linkResponse.json();
        fileUrl = linkData.data;
      }

      const response = await fetch(fileUrl);

      if (!response.ok) {
        throw new Error(
          `Failed to fetch file: ${response.status} ${response.statusText}`
        );
      }

      const contentType =
        response.headers.get("content-type") || "application/octet-stream";
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      let resultText = `✅ Fetched ${buffer.length} bytes from ${network} IPFS (CID: ${cid})\nContent-Type: ${contentType}\n\n`;

      // Return text content directly, binary as base64
      if (
        contentType.startsWith("text/") ||
        contentType.includes("json") ||
        contentType.includes("javascript") ||
        contentType.includes("xml")
      ) {
        if (buffer.length < 100000) {
          resultText += `Content:\n${buffer.toString("utf-8")}`;
        } else {
          resultText += `Content too large to display (${buffer.length} bytes). Use a smaller file or save to disk.`;
        }
      } else if (buffer.length < 50000) {
        resultText += `Base64 Content:\n${buffer.toString("base64")}`;
      } else {
        resultText += `Binary content too large to display (${buffer.length} bytes).`;
      }

      return {
        content: [{ type: "text", text: resultText }],
      };
    } catch (error) {
      return errorResponse(error);
    }
  }
);

// ============================================================================
// Group Operations
// ============================================================================

server.tool(
  "listGroups",
  "List groups in your Pinata account with optional filtering by name",
  {
    network: z
      .enum(["public", "private"])
      .default("public")
      .describe("Whether to list groups in public or private IPFS"),
    name: z.string().optional().describe("Filter groups by name"),
    limit: z
      .number()
      .optional()
      .describe("Maximum number of results to return"),
    pageToken: z.string().optional().describe("Token for pagination"),
  },
  async ({ network, name, limit, pageToken }) => {
    try {
      const params = new URLSearchParams();
      if (name) params.append("name", name);
      if (limit) params.append("limit", limit.toString());
      if (pageToken) params.append("pageToken", pageToken);

      const url = `https://api.pinata.cloud/v3/groups/${network}?${params.toString()}`;

      const response = await fetch(url, {
        method: "GET",
        headers: getHeaders(),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to list groups: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      return successResponse(data);
    } catch (error) {
      return errorResponse(error);
    }
  }
);

server.tool(
  "createGroup",
  "Create a new group in your Pinata account to organize files",
  {
    network: z
      .enum(["public", "private"])
      .default("public")
      .describe("Whether to create the group in public or private IPFS"),
    name: z.string().describe("Name for the new group"),
  },
  async ({ network, name }) => {
    try {
      const url = `https://api.pinata.cloud/v3/groups/${network}`;

      const response = await fetch(url, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ name }),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to create group: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      return {
        content: [
          {
            type: "text",
            text: `✅ Group created successfully!\n\n${JSON.stringify(data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return errorResponse(error);
    }
  }
);

server.tool(
  "getGroup",
  "Retrieve detailed information about a specific group by its ID",
  {
    network: z
      .enum(["public", "private"])
      .default("public")
      .describe("Whether the group is in public or private IPFS"),
    id: z.string().describe("The unique ID of the group to retrieve"),
  },
  async ({ network, id }) => {
    try {
      const url = `https://api.pinata.cloud/v3/groups/${network}/${id}`;

      const response = await fetch(url, {
        method: "GET",
        headers: getHeaders(),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to get group: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      return successResponse(data);
    } catch (error) {
      return errorResponse(error);
    }
  }
);

server.tool(
  "updateGroup",
  "Update metadata for an existing group on Pinata",
  {
    network: z
      .enum(["public", "private"])
      .default("public")
      .describe("Whether the group is in public or private IPFS"),
    id: z.string().describe("The unique ID of the group to update"),
    name: z.string().optional().describe("New name for the group"),
  },
  async ({ network, id, name }) => {
    try {
      const url = `https://api.pinata.cloud/v3/groups/${network}/${id}`;

      const payload: { name?: string } = {};
      if (name) payload.name = name;

      const response = await fetch(url, {
        method: "PUT",
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to update group: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      return successResponse(data);
    } catch (error) {
      return errorResponse(error);
    }
  }
);

server.tool(
  "deleteGroup",
  "Delete a group from your Pinata account by its ID",
  {
    network: z
      .enum(["public", "private"])
      .default("public")
      .describe("Whether the group is in public or private IPFS"),
    id: z.string().describe("The unique ID of the group to delete"),
  },
  async ({ network, id }) => {
    try {
      const url = `https://api.pinata.cloud/v3/groups/${network}/${id}`;

      const response = await fetch(url, {
        method: "DELETE",
        headers: getHeaders(),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to delete group: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      return {
        content: [
          {
            type: "text",
            text: `✅ Group deleted successfully\n\n${JSON.stringify(data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return errorResponse(error);
    }
  }
);

server.tool(
  "addFileToGroup",
  "Add an existing file to a group in your Pinata account",
  {
    network: z
      .enum(["public", "private"])
      .default("public")
      .describe("Whether the group and file are in public or private IPFS"),
    groupId: z.string().describe("The ID of the group to add the file to"),
    fileId: z.string().describe("The ID of the file to add to the group"),
  },
  async ({ network, groupId, fileId }) => {
    try {
      const url = `https://api.pinata.cloud/v3/groups/${network}/${groupId}/ids/${fileId}`;

      const response = await fetch(url, {
        method: "PUT",
        headers: getHeaders(),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to add file to group: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      return {
        content: [
          {
            type: "text",
            text: `✅ File added to group successfully\n\n${JSON.stringify(data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return errorResponse(error);
    }
  }
);

server.tool(
  "removeFileFromGroup",
  "Remove a file from a group in your Pinata account",
  {
    network: z
      .enum(["public", "private"])
      .default("public")
      .describe("Whether the group and file are in public or private IPFS"),
    groupId: z
      .string()
      .describe("The ID of the group to remove the file from"),
    fileId: z.string().describe("The ID of the file to remove from the group"),
  },
  async ({ network, groupId, fileId }) => {
    try {
      const url = `https://api.pinata.cloud/v3/groups/${network}/${groupId}/ids/${fileId}`;

      const response = await fetch(url, {
        method: "DELETE",
        headers: getHeaders(),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to remove file from group: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      return {
        content: [
          {
            type: "text",
            text: `✅ File removed from group successfully\n\n${JSON.stringify(data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return errorResponse(error);
    }
  }
);

// ============================================================================
// x402 Payment Instructions
// ============================================================================

server.tool(
  "createPaymentInstruction",
  "Create a new x402 payment instruction for content monetization. Currently supports USDC (6 decimals) on Base/Base Sepolia only.",
  {
    name: z.string().describe("Name for the payment instruction"),
    pay_to: z
      .string()
      .describe("Wallet address (0x...) to receive USDC payments"),
    amount_usdc: z
      .string()
      .describe("Price in USD as a string (e.g., '0.01' for 1 cent, '1.50' for $1.50). Will be converted to USDC's 6 decimal format."),
    network: z
      .enum(["base", "base-sepolia"])
      .default("base")
      .describe("Blockchain network (Base mainnet or Base Sepolia testnet)"),
    description: z
      .string()
      .optional()
      .describe("Description of the payment instruction"),
  },
  async ({ name, pay_to, amount_usdc, network, description }) => {
    try {
      const url = "https://api.pinata.cloud/v3/x402/payment_instructions";

      // USDC contract addresses
      const USDC_ADDRESSES: Record<string, string> = {
        "base": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      };

      // Convert USD amount to USDC smallest unit (6 decimals)
      // e.g., "0.01" -> "10000", "1.50" -> "1500000"
      const amountInSmallestUnit = Math.round(parseFloat(amount_usdc) * 1_000_000).toString();

      const payload: {
        name: string;
        payment_requirements: Array<{
          asset: string;
          pay_to: string;
          network: string;
          amount: string;
        }>;
        description?: string;
      } = {
        name,
        payment_requirements: [{
          asset: USDC_ADDRESSES[network],
          pay_to,
          network,
          amount: amountInSmallestUnit,
        }],
      };

      if (description) payload.description = description;

      const response = await fetch(url, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to create payment instruction: ${response.status} ${response.statusText}\n${errorText}`
        );
      }

      const data = await response.json();
      return {
        content: [
          {
            type: "text",
            text: `✅ Payment instruction created successfully!\n\n${JSON.stringify(data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return errorResponse(error);
    }
  }
);

server.tool(
  "listPaymentInstructions",
  "List and filter x402 payment instructions for content monetization",
  {
    limit: z
      .number()
      .optional()
      .describe("Limit the number of results returned"),
    pageToken: z.string().optional().describe("Token for pagination"),
    cid: z.string().optional().describe("Filter by associated CID"),
    name: z.string().optional().describe("Filter by name"),
    id: z.string().optional().describe("Filter by specific payment instruction ID"),
  },
  async ({ limit, pageToken, cid, name, id }) => {
    try {
      const params = new URLSearchParams();
      if (limit) params.append("limit", limit.toString());
      if (pageToken) params.append("pageToken", pageToken);
      if (cid) params.append("cid", cid);
      if (name) params.append("name", name);
      if (id) params.append("id", id);

      const url = `https://api.pinata.cloud/v3/x402/payment_instructions?${params.toString()}`;

      const response = await fetch(url, {
        method: "GET",
        headers: getHeaders(),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to list payment instructions: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      return successResponse(data);
    } catch (error) {
      return errorResponse(error);
    }
  }
);

server.tool(
  "getPaymentInstruction",
  "Retrieve a specific x402 payment instruction by ID",
  {
    id: z
      .string()
      .describe("The unique identifier of the payment instruction"),
  },
  async ({ id }) => {
    try {
      const url = `https://api.pinata.cloud/v3/x402/payment_instructions/${id}`;

      const response = await fetch(url, {
        method: "GET",
        headers: getHeaders(),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to get payment instruction: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      return successResponse(data);
    } catch (error) {
      return errorResponse(error);
    }
  }
);

server.tool(
  "updatePaymentInstruction",
  "Update an existing x402 payment instruction. Currently supports USDC (6 decimals) on Base/Base Sepolia only.",
  {
    id: z
      .string()
      .describe("The unique identifier of the payment instruction to update"),
    name: z.string().optional().describe("Updated name"),
    pay_to: z
      .string()
      .optional()
      .describe("Updated wallet address (0x...) to receive USDC payments"),
    amount_usdc: z
      .string()
      .optional()
      .describe("Updated price in USD as a string (e.g., '0.01' for 1 cent, '1.50' for $1.50)"),
    network: z
      .enum(["base", "base-sepolia"])
      .optional()
      .describe("Updated blockchain network"),
    description: z.string().optional().describe("Updated description"),
  },
  async ({ id, name, pay_to, amount_usdc, network, description }) => {
    try {
      const url = `https://api.pinata.cloud/v3/x402/payment_instructions/${id}`;

      // USDC contract addresses
      const USDC_ADDRESSES: Record<string, string> = {
        "base": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      };

      const payload: {
        name?: string;
        payment_requirements?: Array<{
          asset: string;
          pay_to: string;
          network: string;
          amount: string;
        }>;
        description?: string;
      } = {};

      if (name) payload.name = name;
      if (pay_to && amount_usdc && network) {
        // Convert USD amount to USDC smallest unit (6 decimals)
        const amountInSmallestUnit = Math.round(parseFloat(amount_usdc) * 1_000_000).toString();
        payload.payment_requirements = [{
          asset: USDC_ADDRESSES[network],
          pay_to,
          network,
          amount: amountInSmallestUnit,
        }];
      }
      if (description) payload.description = description;

      const response = await fetch(url, {
        method: "PATCH",
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to update payment instruction: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      return successResponse(data);
    } catch (error) {
      return errorResponse(error);
    }
  }
);

server.tool(
  "deletePaymentInstruction",
  "Delete an x402 payment instruction",
  {
    id: z
      .string()
      .describe("The unique identifier of the payment instruction to delete"),
  },
  async ({ id }) => {
    try {
      const url = `https://api.pinata.cloud/v3/x402/payment_instructions/${id}`;

      const response = await fetch(url, {
        method: "DELETE",
        headers: getHeaders(),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to delete payment instruction: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      return {
        content: [
          {
            type: "text",
            text: `✅ Payment instruction deleted successfully\n\n${JSON.stringify(data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return errorResponse(error);
    }
  }
);

// ============================================================================
// x402 Payment Instruction CID Mappings
// ============================================================================

server.tool(
  "listPaymentInstructionCids",
  "List CIDs associated with a payment instruction",
  {
    id: z.string().describe("The payment instruction ID"),
    limit: z
      .number()
      .optional()
      .describe("Limit the number of results returned"),
    pageToken: z.string().optional().describe("Token for pagination"),
  },
  async ({ id, limit, pageToken }) => {
    try {
      const params = new URLSearchParams();
      if (limit) params.append("limit", limit.toString());
      if (pageToken) params.append("pageToken", pageToken);

      const url = `https://api.pinata.cloud/v3/x402/payment_instructions/${id}/cids?${params.toString()}`;

      const response = await fetch(url, {
        method: "GET",
        headers: getHeaders(),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to list CIDs: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      return successResponse(data);
    } catch (error) {
      return errorResponse(error);
    }
  }
);

server.tool(
  "addCidToPaymentInstruction",
  "Associate a CID with a payment instruction for x402 monetization",
  {
    id: z.string().describe("The payment instruction ID"),
    cid: z.string().describe("The CID to associate"),
  },
  async ({ id, cid }) => {
    try {
      const url = `https://api.pinata.cloud/v3/x402/payment_instructions/${id}/cids/${cid}`;

      const response = await fetch(url, {
        method: "PUT",
        headers: getHeaders(),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to add CID to payment instruction: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      return {
        content: [
          {
            type: "text",
            text: `✅ CID added to payment instruction successfully!\n\n${JSON.stringify(data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return errorResponse(error);
    }
  }
);

server.tool(
  "removeCidFromPaymentInstruction",
  "Remove a CID association from a payment instruction",
  {
    id: z.string().describe("The payment instruction ID"),
    cid: z.string().describe("The CID to remove"),
  },
  async ({ id, cid }) => {
    try {
      const url = `https://api.pinata.cloud/v3/x402/payment_instructions/${id}/cids/${cid}`;

      const response = await fetch(url, {
        method: "DELETE",
        headers: getHeaders(),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to remove CID from payment instruction: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      return {
        content: [
          {
            type: "text",
            text: `✅ CID removed from payment instruction successfully\n\n${JSON.stringify(data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return errorResponse(error);
    }
  }
);

// ============================================================================
// CID Signatures
// ============================================================================

server.tool(
  "addSignature",
  "Add an EIP-712 cryptographic signature to a CID for content verification",
  {
    network: z
      .enum(["public", "private"])
      .default("public")
      .describe("Whether the file is on public or private IPFS"),
    cid: z.string().describe("The CID to sign"),
    signature: z.string().describe("The EIP-712 signature"),
    address: z.string().describe("The wallet address that created the signature"),
  },
  async ({ network, cid, signature, address }) => {
    try {
      const url = `https://api.pinata.cloud/v3/files/${network}/signature/${cid}`;

      const response = await fetch(url, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ signature, address }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to add signature: ${response.status} ${response.statusText}\n${errorText}`
        );
      }

      const data = await response.json();
      return {
        content: [
          {
            type: "text",
            text: `✅ Signature added successfully!\n\n${JSON.stringify(data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return errorResponse(error);
    }
  }
);

server.tool(
  "getSignature",
  "Get signature details for a specific CID",
  {
    network: z
      .enum(["public", "private"])
      .default("public")
      .describe("Whether the file is on public or private IPFS"),
    cid: z.string().describe("The CID to get the signature for"),
  },
  async ({ network, cid }) => {
    try {
      const url = `https://api.pinata.cloud/v3/files/${network}/signature/${cid}`;

      const response = await fetch(url, {
        method: "GET",
        headers: getHeaders(),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to get signature: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      return successResponse(data);
    } catch (error) {
      return errorResponse(error);
    }
  }
);

server.tool(
  "deleteSignature",
  "Remove a signature from a CID",
  {
    network: z
      .enum(["public", "private"])
      .default("public")
      .describe("Whether the file is on public or private IPFS"),
    cid: z.string().describe("The CID to remove the signature from"),
  },
  async ({ network, cid }) => {
    try {
      const url = `https://api.pinata.cloud/v3/files/${network}/signature/${cid}`;

      const response = await fetch(url, {
        method: "DELETE",
        headers: getHeaders(),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to delete signature: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      return {
        content: [
          {
            type: "text",
            text: `✅ Signature deleted successfully\n\n${JSON.stringify(data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return errorResponse(error);
    }
  }
);

// ============================================================================
// Signed Upload URLs
// ============================================================================

server.tool(
  "createSignedUploadUrl",
  "Create a signed URL for client-side file uploads without exposing your API key",
  {
    expires: z
      .number()
      .describe("How long the URL is valid in seconds after signing"),
    max_file_size: z
      .number()
      .optional()
      .describe("Restrict the max size of a file upload in bytes"),
    allow_mime_types: z
      .array(z.string())
      .optional()
      .describe("Array of allowed MIME types (supports wildcards like 'image/*')"),
    group_id: z
      .string()
      .optional()
      .describe("ID of the group that the file will be uploaded to"),
    filename: z
      .string()
      .optional()
      .describe("Name of the file that will be uploaded"),
    keyvalues: z
      .record(z.string())
      .optional()
      .describe("Metadata key-value pairs for the file"),
  },
  async ({ expires, max_file_size, allow_mime_types, group_id, filename, keyvalues }) => {
    try {
      const url = "https://uploads.pinata.cloud/v3/files/sign";
      const date = Math.floor(Date.now() / 1000);

      const payload: {
        date: number;
        expires: number;
        max_file_size?: number;
        allow_mime_types?: string[];
        group_id?: string;
        filename?: string;
        keyvalues?: Record<string, string>;
      } = { date, expires };

      if (max_file_size) payload.max_file_size = max_file_size;
      if (allow_mime_types) payload.allow_mime_types = allow_mime_types;
      if (group_id) payload.group_id = group_id;
      if (filename) payload.filename = filename;
      if (keyvalues) payload.keyvalues = keyvalues;

      const response = await fetch(url, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to create signed upload URL: ${response.status} ${response.statusText}\n${errorText}`
        );
      }

      const data = await response.json();
      return {
        content: [
          {
            type: "text",
            text: `✅ Signed upload URL created!\n\nURL: ${data.data}\n\nExpires in ${expires} seconds`,
          },
        ],
      };
    } catch (error) {
      return errorResponse(error);
    }
  }
);

// ============================================================================
// Pin by CID
// ============================================================================

server.tool(
  "pinByCid",
  "Pin an existing CID from the IPFS network to your Pinata account",
  {
    cid: z.string().describe("CID of the file you want to pin"),
    name: z.string().optional().describe("Custom name for the file"),
    group_id: z.string().optional().describe("ID of the group to add the file to"),
    keyvalues: z
      .record(z.string())
      .optional()
      .describe("Metadata key-value pairs for the file"),
    host_nodes: z
      .array(z.string())
      .optional()
      .describe("Array of host node IDs to fetch from"),
  },
  async ({ cid, name, group_id, keyvalues, host_nodes }) => {
    try {
      const url = "https://api.pinata.cloud/v3/files/public/pin_by_cid";

      const payload: {
        cid: string;
        name?: string;
        group_id?: string;
        keyvalues?: Record<string, string>;
        host_nodes?: string[];
      } = { cid };

      if (name) payload.name = name;
      if (group_id) payload.group_id = group_id;
      if (keyvalues) payload.keyvalues = keyvalues;
      if (host_nodes) payload.host_nodes = host_nodes;

      const response = await fetch(url, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to pin CID: ${response.status} ${response.statusText}\n${errorText}`
        );
      }

      const data = await response.json();
      return {
        content: [
          {
            type: "text",
            text: `✅ Pin request queued!\n\n${JSON.stringify(data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return errorResponse(error);
    }
  }
);

server.tool(
  "queryPinRequests",
  "Query the status of pin by CID requests",
  {
    order: z
      .enum(["ASC", "DESC"])
      .optional()
      .describe("Sort by date_queued"),
    status: z
      .enum([
        "prechecking",
        "backfilled",
        "retreiving",
        "expired",
        "searching",
        "over_free_limit",
        "over_max_size",
        "invalid_object",
        "bad_host_node",
      ])
      .optional()
      .describe("Filter by status"),
    cid: z.string().optional().describe("Filter by CID"),
    limit: z.number().optional().describe("Limit number of results"),
    pageToken: z.string().optional().describe("Token for pagination"),
  },
  async ({ order, status, cid, limit, pageToken }) => {
    try {
      const params = new URLSearchParams();
      if (order) params.append("order", order);
      if (status) params.append("status", status);
      if (cid) params.append("cid", cid);
      if (limit) params.append("limit", limit.toString());
      if (pageToken) params.append("pageToken", pageToken);

      const url = `https://api.pinata.cloud/v3/files/public/pin_by_cid?${params.toString()}`;

      const response = await fetch(url, {
        method: "GET",
        headers: getHeaders(),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to query pin requests: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      return successResponse(data);
    } catch (error) {
      return errorResponse(error);
    }
  }
);

server.tool(
  "cancelPinRequest",
  "Cancel a pending pin by CID request",
  {
    id: z.string().describe("ID of the pin request to cancel"),
  },
  async ({ id }) => {
    try {
      const url = `https://api.pinata.cloud/v3/files/public/pin_by_cid/${id}`;

      const response = await fetch(url, {
        method: "DELETE",
        headers: getHeaders(),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to cancel pin request: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      return {
        content: [
          {
            type: "text",
            text: `✅ Pin request cancelled\n\n${JSON.stringify(data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return errorResponse(error);
    }
  }
);

// ============================================================================
// Vectorize (AI)
// ============================================================================

server.tool(
  "vectorizeFile",
  "Vectorize a file for AI/semantic search capabilities",
  {
    file_id: z.string().describe("ID of the file to vectorize"),
  },
  async ({ file_id }) => {
    try {
      const url = `https://uploads.pinata.cloud/v3/vectorize/files/${file_id}`;

      const response = await fetch(url, {
        method: "POST",
        headers: getHeaders(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to vectorize file: ${response.status} ${response.statusText}\n${errorText}`
        );
      }

      const data = await response.json();
      return {
        content: [
          {
            type: "text",
            text: `✅ File vectorized successfully!\n\n${JSON.stringify(data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return errorResponse(error);
    }
  }
);

server.tool(
  "deleteFileVectors",
  "Delete vectors for a file",
  {
    file_id: z.string().describe("ID of the file to delete vectors for"),
  },
  async ({ file_id }) => {
    try {
      const url = `https://uploads.pinata.cloud/v3/vectorize/files/${file_id}`;

      const response = await fetch(url, {
        method: "DELETE",
        headers: getHeaders(),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to delete file vectors: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      return {
        content: [
          {
            type: "text",
            text: `✅ File vectors deleted\n\n${JSON.stringify(data, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return errorResponse(error);
    }
  }
);

server.tool(
  "queryVectors",
  "Query vectorized files in a group using semantic search",
  {
    group_id: z.string().describe("ID of the group to search"),
    text: z.string().describe("Query string for semantic search"),
  },
  async ({ group_id, text }) => {
    try {
      const url = `https://uploads.pinata.cloud/v3/vectorize/groups/${group_id}/query`;

      const response = await fetch(url, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to query vectors: ${response.status} ${response.statusText}\n${errorText}`
        );
      }

      const data = await response.json();
      return successResponse(data);
    } catch (error) {
      return errorResponse(error);
    }
  }
);

// ============================================================================
// Helper Functions
// ============================================================================

function getMimeType(filePath: string): string {
  const extension = filePath.split(".").pop()?.toLowerCase() || "";
  const mimeTypes: Record<string, string> = {
    txt: "text/plain",
    html: "text/html",
    css: "text/css",
    js: "application/javascript",
    json: "application/json",
    xml: "application/xml",
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    svg: "image/svg+xml",
    webp: "image/webp",
    mp3: "audio/mpeg",
    mp4: "video/mp4",
    webm: "video/webm",
    zip: "application/zip",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  };

  return mimeTypes[extension] || "application/octet-stream";
}

// ============================================================================
// File Resources
// ============================================================================

server.tool(
  "listAllowedDirectories",
  "List all directories that this MCP server is allowed to access for file operations",
  {},
  async () => {
    const dirs =
      allowedDirectories.length > 0
        ? allowedDirectories
        : [normalizePath(process.cwd())];
    return {
      content: [
        {
          type: "text",
          text: `Allowed directories:\n${dirs.join("\n")}`,
        },
      ],
    };
  }
);

// Helper function to determine if a file is text-based
function isTextFile(mimeType: string): boolean {
  return (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType === "application/javascript" ||
    mimeType === "application/xml"
  );
}

// Register file resource template for local file access
server.resource(
  "Local Files",
  new ResourceTemplate("file://{+path}", { list: undefined }),
  {
    description:
      "Access local files to upload to Pinata IPFS (only from allowed directories)",
  },
  async (uri, { path }) => {
    let filePath = decodeURIComponent(path as string);
    if (process.platform === "win32") {
      filePath = filePath.replace(/\//g, "\\");
    }

    filePath = await validatePath(filePath);
    const fileStats = await fs.stat(filePath);
    if (!fileStats.isFile()) {
      throw new Error(`Not a file: ${filePath}`);
    }

    const mimeType = getMimeType(filePath);

    if (isTextFile(mimeType)) {
      const content = await fs.readFile(filePath, "utf-8");
      return {
        contents: [
          {
            uri: uri.href,
            mimeType,
            text: content,
          },
        ],
      };
    } else {
      const content = await fs.readFile(filePath);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType,
            blob: content.toString("base64"),
          },
        ],
      };
    }
  }
);

// ============================================================================
// Server Startup
// ============================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Pinata MCP Server running on stdio");
  if (allowedDirectories.length > 0) {
    console.error("Allowed directories:", allowedDirectories);
  } else {
    console.error("No directories specified, using current working directory");
  }
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
