# Agent Runtime Repair V2

The agent-runtime test failures were caused by repository-relative agent definition paths being resolved from the workspace directory instead of the monorepo root.

This repair:
- resolves agent definitions from the repository root;
- makes the loader test discover real repository agent sources from the root;
- keeps Windows path normalization;
- does not change agent contracts or orchestration behavior.

It also makes the test commands deterministic on Windows/PowerShell.
