import type { ReactTestInstance } from 'react-test-renderer'

/** Mocked host components render as strings, which `findAllByType` cannot type. */
export function hostType(name: string): (node: ReactTestInstance) => boolean {
  return (node) => (node.type as unknown) === name
}
