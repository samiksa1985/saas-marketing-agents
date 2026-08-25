# Marketing OS Vertical Slice V1

This batch proves the first complete execution journey on top of the existing architecture.

Flow:
1. POST `/marketing-os/plan`
2. POST `/marketing-os/execute`
3. execution is `APPROVAL_REQUIRED`
4. POST `/marketing-os/approve/:planId`
5. POST `/marketing-os/start/:planId`
6. GET `/marketing-os/runs/:planId`

The Workflow Runtime remains canonical. This batch does not create a second workflow engine.

Important: the approval endpoint is a temporary vertical-slice execution gate. The existing approval API remains the canonical approval subsystem; the next integration pass should connect the execution gate to persisted approval requests/decisions.
