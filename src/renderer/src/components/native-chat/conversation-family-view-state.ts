import { useState } from 'react'
import { setWithLRU } from '@/lib/scroll-cache'

type FamilyViewState = { expanded: boolean; selectedId: string | null; openDetails: string[] }
const cache = new Map<string, FamilyViewState>()
const empty: FamilyViewState = { expanded: false, selectedId: null, openDetails: [] }

export function useConversationFamilyViewState(key: string) {
  const [snapshot, setSnapshot] = useState(() => ({ key, value: cache.get(key) ?? empty }))
  const value = snapshot.key === key ? snapshot.value : (cache.get(key) ?? empty)
  const update = (patch: Partial<FamilyViewState>): void => {
    const next = { ...(cache.get(key) ?? value), ...patch }
    setWithLRU(cache, key, next)
    setSnapshot({ key, value: next })
  }
  const setDetailOpen = (id: string, open: boolean): void => {
    const details = (cache.get(key) ?? value).openDetails
    if (details.includes(id) === open) {
      return
    }
    update({
      openDetails: open ? [...details, id].slice(-128) : details.filter((entry) => entry !== id)
    })
  }
  return { ...value, update, setDetailOpen }
}
