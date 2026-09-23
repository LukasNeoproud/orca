import { Pressable, Switch, Text, View } from 'react-native'
import type { SetupAgentStartupPolicy } from '../../../src/shared/orca-yaml-hook-types'
import type { WorkspaceCreateSetupDecision } from '../tasks/workspace-create-params'
import { colors } from '../theme/mobile-theme'
import { newWorktreeFormStyles as styles } from './new-worktree-form-styles'
import type { SetupRunPolicy } from './new-worktree-modal-types'

export function NewWorkspaceSetupScriptField({
  command,
  source,
  runPolicy,
  decision,
  runSetup,
  startupPolicy,
  onDecisionChange,
  onRunSetupChange,
  onStartupPolicyChange
}: {
  command: string
  source: string | null
  runPolicy: SetupRunPolicy
  decision: Exclude<WorkspaceCreateSetupDecision, 'inherit'> | null
  runSetup: boolean
  startupPolicy: SetupAgentStartupPolicy
  onDecisionChange: (decision: Exclude<WorkspaceCreateSetupDecision, 'inherit'>) => void
  onRunSetupChange: (run: boolean) => void
  onStartupPolicyChange: (policy: SetupAgentStartupPolicy) => void
}) {
  const setupWillRun = runPolicy === 'ask' ? decision === 'run' : runSetup
  return (
    <View style={styles.field}>
      <View style={styles.setupHeader}>
        <Text style={styles.label}>Setup script</Text>
        {source ? (
          <View style={styles.sourceBadge}>
            <Text style={styles.sourceBadgeText}>
              {source === 'orca.yaml' ? 'ORCA.YAML' : 'HOOKS'}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.setupBox}>
        {runPolicy === 'ask' ? (
          <View style={styles.setupChoiceRow}>
            <Pressable
              style={[
                styles.setupChoiceButton,
                decision === 'run' && styles.setupChoiceButtonSelected
              ]}
              onPress={() => onDecisionChange('run')}
            >
              <Text style={styles.setupChoiceText}>Run</Text>
            </Pressable>
            <Pressable
              style={[
                styles.setupChoiceButton,
                decision === 'skip' && styles.setupChoiceButtonSelected
              ]}
              onPress={() => onDecisionChange('skip')}
            >
              <Text style={styles.setupChoiceText}>Skip</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.setupToggleRow}>
            <Text style={styles.setupToggleLabel}>Run setup command</Text>
            <Switch
              value={runSetup}
              onValueChange={onRunSetupChange}
              trackColor={{ false: colors.borderSubtle, true: colors.textSecondary }}
              thumbColor={colors.textPrimary}
              style={styles.setupSwitch}
            />
          </View>
        )}
        <View style={styles.setupCommandBlock}>
          <Text style={styles.setupCommand}>{command}</Text>
        </View>
        <View style={styles.setupToggleRow}>
          <Text style={styles.setupToggleLabel}>Wait for setup before starting agent</Text>
          <Switch
            value={startupPolicy === 'wait-for-setup'}
            onValueChange={(wait) =>
              onStartupPolicyChange(wait ? 'wait-for-setup' : 'start-immediately')
            }
            disabled={!setupWillRun}
            trackColor={{ false: colors.borderSubtle, true: colors.textSecondary }}
            thumbColor={colors.textPrimary}
            style={styles.setupSwitch}
          />
        </View>
      </View>
    </View>
  )
}
