import { describe, expect, it } from 'vitest'
import {
  azureDevOpsOrganizationForRepo,
  azureDevOpsOrganizationKeyMatches,
  parseAzureDevOpsOrganizationUrl
} from './azure-devops-organization'
import { parseAzureDevOpsRepoRef } from './repository-ref'

describe('parseAzureDevOpsOrganizationUrl', () => {
  it('normalizes cloud organization URLs', () => {
    expect(parseAzureDevOpsOrganizationUrl('https://dev.azure.com/Contoso/Project/_git/x')).toEqual(
      {
        organizationKey: 'dev.azure.com/contoso',
        organizationUrl: 'https://dev.azure.com/Contoso',
        label: 'Contoso'
      }
    )
    expect(parseAzureDevOpsOrganizationUrl('contoso.visualstudio.com')?.organizationKey).toBe(
      'dev.azure.com/contoso'
    )
  })

  it('keeps Server collection paths as the organization scope', () => {
    expect(
      parseAzureDevOpsOrganizationUrl('https://tfs.example.com/tfs/DefaultCollection/')
    ).toEqual({
      organizationKey: 'tfs.example.com/tfs/defaultcollection',
      organizationUrl: 'https://tfs.example.com/tfs/DefaultCollection',
      label: 'DefaultCollection'
    })
  })

  it('rejects empty and non-http input', () => {
    expect(parseAzureDevOpsOrganizationUrl('  ')).toBeNull()
    expect(parseAzureDevOpsOrganizationUrl('ftp://dev.azure.com/x')).toBeNull()
    expect(parseAzureDevOpsOrganizationUrl('https://dev.azure.com/')).toBeNull()
  })
})

describe('azureDevOpsOrganizationForRepo', () => {
  it('derives cloud and server organizations from git remotes', () => {
    const cloud = parseAzureDevOpsRepoRef('git@ssh.dev.azure.com:v3/contoso/Web/app')
    expect(cloud && azureDevOpsOrganizationForRepo(cloud)?.organizationKey).toBe(
      'dev.azure.com/contoso'
    )
    const server = parseAzureDevOpsRepoRef('https://tfs.example.com/tfs/Coll/Web/_git/app')
    expect(server && azureDevOpsOrganizationForRepo(server)?.organizationKey).toBe(
      'tfs.example.com/tfs/coll'
    )
  })
})

describe('azureDevOpsOrganizationKeyMatches', () => {
  it('matches API URLs under the organization only', () => {
    const key = 'dev.azure.com/contoso'
    expect(
      azureDevOpsOrganizationKeyMatches(key, new URL('https://dev.azure.com/contoso/Web/_apis/git'))
    ).toBe(true)
    expect(
      azureDevOpsOrganizationKeyMatches(key, new URL('https://dev.azure.com/contosoX/_apis'))
    ).toBe(false)
    expect(
      azureDevOpsOrganizationKeyMatches(key, new URL('https://contoso.visualstudio.com/Web'))
    ).toBe(true)
  })
})
