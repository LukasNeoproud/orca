import { describe, expect, it } from 'vitest'
import {
  classifyReleaseTag,
  checkReleaseTagPattern,
  DEFAULT_RELEASE_TAG_PATTERNS,
  readReleaseTagPatterns,
  releaseTagMatchesPattern
} from './release-tag-patterns'
import { DEFAULT_WORK_FLOW_SETTINGS, readWorkFlowSettings } from './work-flow-settings'

describe('work flow settings of the app', () => {
  it('defaults to 1, 2, 1 and 3 working days with every notification on', () => {
    expect(DEFAULT_WORK_FLOW_SETTINGS).toEqual({
      deadlineWorkingDays: {
        'no-pull-request': 1,
        'waiting-for-review': 2,
        'changes-requested': 1,
        'merged-unreleased': 3
      },
      notifyWhenStalled: {
        'no-pull-request': true,
        'waiting-for-review': true,
        'changes-requested': true,
        'merged-unreleased': true
      }
    })
    for (const stored of [undefined, null, 'on', 3, [], {}, { deadlineWorkingDays: 'two' }]) {
      expect(readWorkFlowSettings(stored)).toEqual(DEFAULT_WORK_FLOW_SETTINGS)
    }
  })

  it('reads an invalid deadline as its default and keeps the valid ones', () => {
    const days = (value: unknown): number =>
      readWorkFlowSettings({ deadlineWorkingDays: { 'waiting-for-review': value } })
        .deadlineWorkingDays['waiting-for-review']
    expect(days(5)).toBe(5)
    expect(days(60)).toBe(60)
    for (const invalid of [0, -1, 61, 2.5, '4', null, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(days(invalid)).toBe(2)
    }
    expect(
      readWorkFlowSettings({
        deadlineWorkingDays: { 'no-pull-request': 0, 'merged-unreleased': 7 }
      }).deadlineWorkingDays
    ).toEqual({
      'no-pull-request': 1,
      'waiting-for-review': 2,
      'changes-requested': 1,
      'merged-unreleased': 7
    })
  })

  it('turns a notification off only on an explicit false', () => {
    const notify = readWorkFlowSettings({
      notifyWhenStalled: { 'no-pull-request': false, 'waiting-for-review': 0, approved: false }
    }).notifyWhenStalled
    expect(notify).toEqual({
      'no-pull-request': false,
      'waiting-for-review': true,
      'changes-requested': true,
      'merged-unreleased': true
    })
  })

  it('does not hand out the defaults themselves', () => {
    readWorkFlowSettings({}).deadlineWorkingDays['no-pull-request'] = 9
    expect(DEFAULT_WORK_FLOW_SETTINGS.deadlineWorkingDays['no-pull-request']).toBe(1)
  })
})

describe('release tag patterns of a repository', () => {
  it('defaults to `v*` for production and `v*-dev` for dev builds', () => {
    expect(DEFAULT_RELEASE_TAG_PATTERNS).toEqual({ production: 'v*', dev: 'v*-dev' })
    for (const stored of [undefined, null, 'v*', 7, []]) {
      expect(readReleaseTagPatterns(stored)).toEqual(DEFAULT_RELEASE_TAG_PATTERNS)
    }
    expect(readReleaseTagPatterns({ production: 'release-*' })).toEqual({
      production: 'release-*',
      dev: 'v*-dev'
    })
  })

  it('reads an invalid pattern as its default and null or blank as off', () => {
    expect(readReleaseTagPatterns({ production: 'v 1', dev: 12 })).toEqual(
      DEFAULT_RELEASE_TAG_PATTERNS
    )
    expect(readReleaseTagPatterns({ production: null, dev: '  ' })).toEqual({
      production: null,
      dev: null
    })
  })

  it('refuses a pattern no tag name can match, with the reason', () => {
    expect(checkReleaseTagPattern(' v* ')).toEqual({ ok: true, pattern: 'v*' })
    expect(checkReleaseTagPattern('')).toEqual({ ok: true, pattern: null })
    expect(checkReleaseTagPattern(null)).toEqual({ ok: true, pattern: null })
    expect(checkReleaseTagPattern(5)).toEqual({ ok: false, problem: 'not-text' })
    expect(checkReleaseTagPattern('v'.repeat(101))).toEqual({ ok: false, problem: 'too-long' })
    expect(checkReleaseTagPattern('--contains')).toEqual({ ok: false, problem: 'leading-dash' })
    for (const pattern of ['v 1', 'v[0-9]*', 'v~1', 'v^', 'a:b', 'a\\b', 'v\t*', 'v\u0000']) {
      expect(checkReleaseTagPattern(pattern)).toEqual({ ok: false, problem: 'forbidden-character' })
    }
  })

  it('matches `*` as any run of characters and `?` as one', () => {
    expect(releaseTagMatchesPattern('v2.4.0', 'v*')).toBe(true)
    expect(releaseTagMatchesPattern('v', 'v*')).toBe(true)
    expect(releaseTagMatchesPattern('2.4.0', 'v*')).toBe(false)
    expect(releaseTagMatchesPattern('v2.4.0-dev', 'v*-dev')).toBe(true)
    expect(releaseTagMatchesPattern('v2.4.0-dev1', 'v*-dev')).toBe(false)
    expect(releaseTagMatchesPattern('release/2.4', 'release/*')).toBe(true)
    expect(releaseTagMatchesPattern('v1.2', 'v?.?')).toBe(true)
    expect(releaseTagMatchesPattern('v10.2', 'v?.?')).toBe(false)
    expect(releaseTagMatchesPattern('v1.x', 'v1.x')).toBe(true)
    expect(releaseTagMatchesPattern('v1ax', 'v1.x')).toBe(false)
    expect(releaseTagMatchesPattern('a-b-a-b-c', '*a-b-c')).toBe(true)
    expect(releaseTagMatchesPattern('', '*')).toBe(true)
    expect(releaseTagMatchesPattern('a'.repeat(250), `${'*a'.repeat(40)}b`)).toBe(false)
  })

  it('sorts a tag into dev before production, and into neither when a stage is off', () => {
    expect(classifyReleaseTag('v2.4.0', DEFAULT_RELEASE_TAG_PATTERNS)).toBe('production')
    expect(classifyReleaseTag('v2.4.0-dev', DEFAULT_RELEASE_TAG_PATTERNS)).toBe('dev')
    expect(classifyReleaseTag('nightly-7', DEFAULT_RELEASE_TAG_PATTERNS)).toBeNull()
    expect(classifyReleaseTag('v2.4.0-dev', { production: 'v*', dev: null })).toBe('production')
    expect(classifyReleaseTag('v2.4.0', { production: null, dev: 'v*-dev' })).toBeNull()
  })
})
