/**
 * Deadlines counted in working days, Monday to Friday. Holidays are not known here.
 *
 * A deadline of N days falls at the same time of day N working days later, so Friday afternoon
 * plus one day is Monday afternoon. A start on a weekend counts from Monday midnight.
 */

/** Minutes the user's wall clock is ahead of UTC at an instant, so a zone change is followed. */
export type WallClockOffset = (epochMs: number) => number

export const systemWallClockOffset: WallClockOffset = (epochMs) =>
  -new Date(epochMs).getTimezoneOffset()

const MINUTE_MS = 60_000
const SATURDAY = 6
const SUNDAY = 0

// The wall clock is carried in a Date's UTC fields, so no arithmetic depends on the process zone.
function toWallClock(epochMs: number, offset: WallClockOffset): Date {
  return new Date(epochMs + offset(epochMs) * MINUTE_MS)
}

function fromWallClock(wall: Date, offset: WallClockOffset): number {
  const wallMs = wall.getTime()
  const guess = wallMs - offset(wallMs) * MINUTE_MS
  // Second pass: the offset in force at the result, which differs across a zone change.
  return wallMs - offset(guess) * MINUTE_MS
}

function isWeekend(wall: Date): boolean {
  const day = wall.getUTCDay()
  return day === SATURDAY || day === SUNDAY
}

export function isWorkingDay(
  epochMs: number,
  offset: WallClockOffset = systemWallClockOffset
): boolean {
  return !isWeekend(toWallClock(epochMs, offset))
}

/** The instant `workingDays` working days after `sinceMs`. */
export function addWorkingDays(
  sinceMs: number,
  workingDays: number,
  offset: WallClockOffset = systemWallClockOffset
): number {
  const wall = toWallClock(sinceMs, offset)
  if (isWeekend(wall)) {
    while (isWeekend(wall)) {
      wall.setUTCDate(wall.getUTCDate() + 1)
    }
    wall.setUTCHours(0, 0, 0, 0)
  }
  let remaining = Math.max(0, Math.floor(workingDays))
  while (remaining > 0) {
    wall.setUTCDate(wall.getUTCDate() + 1)
    if (!isWeekend(wall)) {
      remaining -= 1
    }
  }
  return fromWallClock(wall, offset)
}
