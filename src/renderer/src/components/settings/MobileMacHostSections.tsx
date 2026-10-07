import { MobileDeviceApprovalsSection } from './MobileDeviceApprovalsSection'
import { MobileHostPowerControlSection } from './MobileHostPowerControlSection'

/** Mobile settings that only a local macOS host can act on. */
export function MobileMacHostSections(): React.JSX.Element {
  return (
    <>
      <MobileDeviceApprovalsSection />
      <MobileHostPowerControlSection />
    </>
  )
}
