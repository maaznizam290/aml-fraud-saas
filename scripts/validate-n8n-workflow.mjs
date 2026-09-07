#!/usr/bin/env node
// Static structural validation for n8n/workflows/*.json. This sandbox has
// no running n8n instance to actually import these into (see
// docs/ORCHESTRATION.md "Known limitations") — this is the next best thing:
// catches malformed JSON, dangling connections, missing required fields,
// and hardcoded secrets before a human ever tries to import them.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const workflowsDir = path.join(rootDir, "n8n", "workflows");

const SECRET_PATTERNS = [
  /sk-ant-[a-zA-Z0-9-_]+/,
  /xox[baprs]-[a-zA-Z0-9-]+/, // Slack tokens
  /re_[a-zA-Z0-9]{20,}/, // Resend keys
  /AKIA[0-9A-Z]{16}/,
];

const errors = [];
const files = readdirSync(workflowsDir).filter((f) => f.endsWith(".json"));

if (files.length === 0) {
  errors.push("No workflow files found in n8n/workflows.");
}

for (const file of files) {
  const filePath = path.join(workflowsDir, file);
  const raw = readFileSync(filePath, "utf8");

  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(raw)) {
      errors.push(`${file}: possible hardcoded secret matching ${pattern}`);
    }
  }

  let workflow;
  try {
    workflow = JSON.parse(raw);
  } catch (err) {
    errors.push(`${file}: invalid JSON (${err.message})`);
    continue;
  }

  if (!Array.isArray(workflow.nodes) || workflow.nodes.length === 0) {
    errors.push(`${file}: missing or empty "nodes" array`);
    continue;
  }
  if (typeof workflow.connections !== "object" || workflow.connections === null) {
    errors.push(`${file}: missing "connections" object`);
    continue;
  }

  const nodeNames = new Set(workflow.nodes.map((n) => n.name));

  for (const node of workflow.nodes) {
    for (const field of ["id", "name", "type", "typeVersion", "position", "parameters"]) {
      if (!(field in node)) {
        errors.push(`${file}: node ${node.name ?? node.id ?? "?"} is missing required field "${field}"`);
      }
    }
  }

  const hasWebhookTrigger = workflow.nodes.some((n) => n.type === "n8n-nodes-base.webhook");
  if (!hasWebhookTrigger) {
    errors.push(`${file}: no n8n-nodes-base.webhook trigger node found`);
  }
  for (const node of workflow.nodes.filter((n) => n.type === "n8n-nodes-base.webhook")) {
    if (!node.parameters?.path) {
      errors.push(`${file}: webhook node "${node.name}" has no "path" parameter`);
    }
  }

  for (const [sourceName, outputs] of Object.entries(workflow.connections)) {
    if (!nodeNames.has(sourceName)) {
      errors.push(`${file}: connection references unknown source node "${sourceName}"`);
    }
    for (const branch of outputs.main ?? []) {
      for (const edge of branch) {
        if (!nodeNames.has(edge.node)) {
          errors.push(`${file}: connection from "${sourceName}" references unknown target node "${edge.node}"`);
        }
      }
    }
  }
}

if (errors.length > 0) {
  console.error("n8n workflow validation failed:\n");
  for (const err of errors) console.error(` - ${err}`);
  process.exit(1);
}

console.log(`n8n workflow validation passed: ${files.length} workflow file(s) checked.`);
