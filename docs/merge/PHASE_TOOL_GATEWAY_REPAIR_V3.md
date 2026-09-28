# Tool Gateway Repair V3

The previous failure had two concrete causes:
1. The repository's canonical Permission union does not contain `crm:*` or `ads:*`; tests now use existing contract permissions.
2. Node/tsx was resolving the package through `dist`, while the source had just changed. This batch explicitly builds `tool-gateway` before running agent-runtime tests and adds the correct project/package dependency.

No second runtime or gateway is created.
