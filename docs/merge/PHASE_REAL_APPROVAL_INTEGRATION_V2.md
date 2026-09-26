# Real Approval Integration V2

Minimal TypeScript/Nest public-return-type fix for `TS4053`.

The Marketing OS controller now exposes explicit response interfaces instead of allowing Nest metadata generation to infer the internal `ApprovalRecord` type through an exported controller method.

No architecture change.
