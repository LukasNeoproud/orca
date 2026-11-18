import { describe, expect, it } from 'vitest'
import { getSnapshotImageFramework, isSnapshotImagePath } from './snapshot-image-path'
import { isTestCodePath } from './test-code-path'

describe('getSnapshotImageFramework', () => {
  it('recognizes Paparazzi snapshots in any module and source set', () => {
    for (const filePath of [
      'app/src/test/snapshots/images/com.example.shop_PaymentScreenTest_default.png',
      'feature/cart/src/testDebug/snapshots/images/com.example_CartTest_empty.png',
      'src/test/snapshots/images/Root_test.png',
      'app\\src\\test\\snapshots\\images\\com.example_Test_dark.png'
    ]) {
      expect(getSnapshotImageFramework(filePath), filePath).toBe('paparazzi')
    }
  })

  it('recognizes Roborazzi references by directory name or the documented src/screenshots', () => {
    for (const filePath of [
      'app/src/test/snapshots/roborazzi/PaymentScreen.png',
      'app/build/outputs/roborazzi/com.example.PaymentTest.pay.png',
      'app/src/screenshots/PaymentScreen.png',
      'app/src/test/screenshots/PaymentScreen_dark.webp',
      'screenshots\\roborazzi\\Home.png'
    ]) {
      expect(getSnapshotImageFramework(filePath), filePath).toBe('roborazzi')
    }
  })

  it('recognizes swift-snapshot-testing references next to the test source', () => {
    for (const filePath of [
      'ShopTests/__Snapshots__/PaymentViewTests/testDefault.1.png',
      'Tests/ShopTests/Payment/__Snapshots__/PaymentViewTests/testDark.iPhone15.png',
      '__Snapshots__/RootTests/testRoot.1.png'
    ]) {
      expect(getSnapshotImageFramework(filePath), filePath).toBe('swift-snapshot-testing')
    }
  })

  it('ignores images outside a snapshot directory and non-image snapshot files', () => {
    for (const filePath of [
      'app/src/main/res/drawable/logo.png',
      'docs/screenshots/home.png',
      'Shop/Assets.xcassets/AppIcon.appiconset/icon.png',
      // Text references of swift-snapshot-testing and Jest are not images.
      'ShopTests/__Snapshots__/PaymentViewTests/testDump.1.txt',
      'src/components/__snapshots__/Chip.tsx.snap',
      'src/components/__snapshots__/chip.png',
      // The directory must be a whole segment.
      'app/src/test/snapshots/images.png',
      'app/roborazzi-notes/home.png',
      'app/src/test/snapshots/videos/com.example_Test_scroll.mov',
      ''
    ]) {
      expect(getSnapshotImageFramework(filePath), filePath).toBeNull()
      expect(isSnapshotImagePath(filePath), filePath).toBe(false)
    }
  })

  it('leaves out the comparison images Roborazzi writes beside a failed reference', () => {
    expect(getSnapshotImageFramework('app/src/screenshots/PaymentScreen_compare.png')).toBeNull()
    expect(getSnapshotImageFramework('app/build/outputs/roborazzi/Home_actual.png')).toBeNull()
    expect(getSnapshotImageFramework('app/src/screenshots/compare_view.png')).toBe('roborazzi')
  })

  it('counts every recognized snapshot image as test code', () => {
    // No test directory in this path: only the snapshot rule can match it.
    expect(isTestCodePath('app/src/screenshots/PaymentScreen.png')).toBe(true)
    expect(isTestCodePath('app/src/main/res/drawable/logo.png')).toBe(false)
  })
})
