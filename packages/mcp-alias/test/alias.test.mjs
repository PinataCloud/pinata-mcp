import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const bin = fileURLToPath(new URL("../bin.js", import.meta.url));

// Starts the alias, sends `messages` over stdio, and resolves with the response to the
// request whose id is `waitFor` and everything the server wrote to stderr
const talk = (args, messages, waitFor) =>
	new Promise((resolve, reject) => {
		const server = spawn(process.execPath, [bin, ...args], {
			env: { ...process.env, PINATA_JWT: "test-jwt" },
		});
		let stdout = "";
		let stderr = "";
		const timer = setTimeout(() => {
			server.kill();
			reject(new Error(`no response to request ${waitFor}; stderr: ${stderr}`));
		}, 10_000);
		server.stderr.on("data", (chunk) => {
			stderr += chunk;
		});
		server.stdout.on("data", (chunk) => {
			stdout += chunk;
			for (const line of stdout.split("\n")) {
				if (!line.trim()) continue;
				const message = JSON.parse(line);
				if (message.id === waitFor) {
					clearTimeout(timer);
					server.kill();
					resolve({ message, stderr });
				}
			}
		});
		server.on("error", reject);
		for (const message of messages) {
			server.stdin.write(`${JSON.stringify(message)}\n`);
		}
	});

test("runs the pinata-mcp server with its tools and the allowed directories given", async () => {
	const dir = await mkdtemp(join(tmpdir(), "pinata-mcp-alias-"));
	try {
		const { message, stderr } = await talk(
			[dir],
			[
				{
					jsonrpc: "2.0",
					id: 1,
					method: "initialize",
					params: {
						protocolVersion: "2025-06-18",
						capabilities: {},
						clientInfo: { name: "alias-test", version: "0" },
					},
				},
				{ jsonrpc: "2.0", method: "notifications/initialized" },
				{ jsonrpc: "2.0", id: 2, method: "tools/list" },
			],
			2,
		);
		const tools = message.result.tools.map((tool) => tool.name);
		for (const name of ["testAuthentication", "uploadFile", "uploadFolder", "getUploadLimits"]) {
			assert.ok(tools.includes(name), `missing tool ${name}`);
		}
		assert.match(stderr, /Allowed directories/);
		assert.ok(stderr.includes(dir), "the directory argument reached pinata-mcp");
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
