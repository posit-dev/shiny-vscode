// Guards the `agent` metadata on the command contributions in package.json.
//
// Positron exposes commands with this metadata to AI agents, and Positron's
// own skill docs name these exact command ids (see the shiny command snapshot
// in Positron's agentSkillDrift test). Renaming a command or dropping its
// `agent` block silently breaks agents in Positron, so assert it here.

import * as assert from "assert";
import * as vscode from "vscode";

interface AgentMetadata {
  description: string;
  returns?: string;
}

interface CommandContribution {
  command: string;
  agent?: AgentMetadata;
}

function getCommandContribution(id: string): CommandContribution {
  const ext = vscode.extensions.getExtension("posit.shiny");
  assert.ok(ext, "posit.shiny extension should be present");
  const packageJSON = ext.packageJSON as {
    contributes: { commands: CommandContribution[] };
  };
  const command = packageJSON.contributes.commands.find(
    (c) => c.command === id
  );
  assert.ok(command, `command ${id} should be contributed in package.json`);
  return command;
}

function assertAgentMetadata(id: string, expectReturns: boolean): void {
  const command = getCommandContribution(id);
  assert.ok(command.agent, `command ${id} should have agent metadata`);
  assert.ok(
    command.agent.description.length > 0,
    `command ${id} should have a non-empty agent description`
  );
  if (expectReturns) {
    assert.ok(
      command.agent.returns?.includes("vscode.Uri"),
      `command ${id} should document its vscode.Uri return value for agents`
    );
  }
}

suite("Agent command metadata", () => {
  test("shiny.python.runApp is exposed to agents and documents its URL return value", () => {
    assertAgentMetadata("shiny.python.runApp", true);
  });

  test("shiny.python.debugApp is exposed to agents and documents its URL return value", () => {
    assertAgentMetadata("shiny.python.debugApp", true);
  });

  test("shiny.r.runApp is exposed to agents and documents its URL return value", () => {
    assertAgentMetadata("shiny.r.runApp", true);
  });

  test("shiny.stopApp is exposed to agents", () => {
    assertAgentMetadata("shiny.stopApp", false);
  });
});
