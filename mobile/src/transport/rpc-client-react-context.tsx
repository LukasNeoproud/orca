import { createContext, useContext, type ReactNode } from 'react'
import type { RpcClientContextValue } from './rpc-client-context-contract'

// Why its own module: `client-context` and its `.web` sibling both re-export the hooks that read
// it, so a context declared in either closed an import cycle. A bundle holds one of the two.
const Ctx = createContext<RpcClientContextValue | null>(null)

export function RpcClientContextProvider({
  value,
  children
}: {
  value: RpcClientContextValue
  children: ReactNode
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useRpcClientContext(): RpcClientContextValue {
  const ctx = useContext(Ctx)
  if (!ctx) {
    throw new Error('useRpcClientContext must be used inside <RpcClientProvider>')
  }
  return ctx
}
