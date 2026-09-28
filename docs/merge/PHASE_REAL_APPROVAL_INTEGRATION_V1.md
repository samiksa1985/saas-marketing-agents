# Real Approval Integration V1

Marketing OS execution no longer uses a local `approve()` flag.

The execution service creates an approval request through the existing `ApprovalApiService` and retains its approval ID. `start` re-reads the canonical approval decision and proceeds only for `approved` or `approved_with_conditions`.

The existing approval controller remains the canonical API/control path. This batch does not create a second approval subsystem.

Important limitation: the existing `ApprovalApiService` is currently in-memory. Durable approval persistence remains a later database vertical slice.
