#!/usr/bin/env node

import { Command } from "commander";
import { registerStartCommand } from "./commands/start.js";
import { registerValidateCommand } from "./commands/validate.js";
import { registerTestCommand } from "./commands/test.js";
import { registerStatusCommand } from "./commands/status.js";

const program = new Command();

program
  .name("bastion")
  .description("Bastion AI proxy CLI")
  .version("0.1.0");

registerStartCommand(program);
registerValidateCommand(program);
registerTestCommand(program);
registerStatusCommand(program);

program.parse();
