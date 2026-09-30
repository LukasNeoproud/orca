import { runStructuredInteractionMcpServer } from './structured-interaction-mcp'

void runStructuredInteractionMcpServer().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
