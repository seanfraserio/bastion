#!/usr/bin/env node

import { createRequire } from "node:module";
import { Command } from "commander";
import { registerStartCommand } from "./commands/start.js";
import { registerValidateCommand } from "./commands/validate.js";
import { registerTestCommand } from "./commands/test.js";
import { registerStatusCommand } from "./commands/status.js";

const require_ = createRequire(import.meta.url);
const pkg = require_("../package.json") as { version: string };

const program = new Command();

program
  .name("bastion")
  .description("Bastion AI proxy CLI")
  .version(pkg.version);

registerStartCommand(program);
registerValidateCommand(program);
registerTestCommand(program);
registerStatusCommand(program);

program.parse();
