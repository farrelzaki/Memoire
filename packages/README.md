# packages/

Shared, publishable workspace packages (see technical plan §41). One package
per concern:

| Package | Purpose | Sprint |
| --- | --- | --- |
| `config/` | shared tsconfig/eslint base | Foundation+ |
| `types/` | shared TypeScript types | when needed |
| `validation/` | shared Zod schemas (frontend + backend) | when needed |
| `editor/` | Tiptap editor building blocks | Editor |
| `ui/` | shared UI primitives | when needed |

Only create a package once there is real shared code — empty packages add
maintenance without value. Each package is named `@memoire/<name>` and declared
via `pnpm-workspace.yaml` (already covered by the `packages/*` glob).
