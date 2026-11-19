#!/usr/bin/env node
// @pinata/mcp is an alias of pinata-mcp: this runs its server in this process, so it
// gets the same arguments (allowed directories) and environment (PINATA_JWT, GATEWAY_URL).
import "pinata-mcp";
