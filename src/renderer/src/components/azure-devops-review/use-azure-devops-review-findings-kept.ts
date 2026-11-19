import { useEffect, useState } from 'react'
import { azureDevOpsReviewHostKeepsFindings } from '@/lib/azure-devops-review-client'

/** Whether the host stores a severity the user sets on a draft. */
export function useAzureDevOpsReviewFindingsKept(): boolean {
  // Why false until answered: a host that drops the severity must not be offered a change.
  const [kept, setKept] = useState(false)
  useEffect(() => {
    let current = true
    void azureDevOpsReviewHostKeepsFindings().then((supported) => {
      if (current) {
        setKept(supported)
      }
    })
    return () => {
      current = false
    }
  }, [])
  return kept
}
