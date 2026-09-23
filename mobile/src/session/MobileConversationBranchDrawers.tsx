import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native'
import { X } from 'lucide-react-native'
import type {
  AgentSessionBranchRecord,
  AgentSessionBranchRelationKind
} from '../../../src/shared/agent-session-branch'
import { BottomDrawer } from '../components/BottomDrawer'
import { colors } from '../theme/mobile-theme'
import { mobileConversationBranchStateLabel } from './mobile-conversation-branch-model'
import type { MobileConversationBranchController } from './use-mobile-conversation-branching'
import { mobileConversationBranchStyles as styles } from './mobile-conversation-branch-styles'

const RELATIONS: readonly { id: AgentSessionBranchRelationKind; label: string }[] = [
  { id: 'discussion', label: 'Discussion' },
  { id: 'subtask', label: 'Subtask' },
  { id: 'alternative', label: 'Alternative' }
]

function Choice({
  label,
  selected,
  disabled,
  onPress
}: {
  label: string
  selected: boolean
  disabled?: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.choice, selected && styles.choiceSelected, disabled && styles.buttonDisabled]}
    >
      <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text>
    </Pressable>
  )
}

function Button({
  label,
  primary,
  disabled,
  onPress
}: {
  label: string
  primary?: boolean
  disabled?: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, primary && styles.primaryButton, disabled && styles.buttonDisabled]}
    >
      <Text style={[styles.buttonText, primary && styles.primaryButtonText]}>{label}</Text>
    </Pressable>
  )
}

function CloseButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onPress} hitSlop={8}>
      <X size={20} color={colors.textSecondary} />
    </Pressable>
  )
}

function BranchActions({
  branch,
  controller
}: {
  branch: AgentSessionBranchRecord
  controller: MobileConversationBranchController
}) {
  return (
    <View style={styles.buttonRow}>
      <Button
        label="Source"
        disabled={controller.busy}
        onPress={() => controller.navigate(branch, true)}
      />
      <Button
        label="Open"
        disabled={controller.busy}
        onPress={() => controller.navigate(branch, false)}
      />
      {branch.state === 'prepared' ? (
        <Button
          label="Start work"
          primary
          disabled={controller.busy}
          onPress={() => controller.start(branch)}
        />
      ) : null}
    </View>
  )
}

function PreparationDrawer({ controller }: { controller: MobileConversationBranchController }) {
  const selection = controller.selection
  const close = () => {
    controller.setSelection(null)
    controller.clearError()
  }
  const locked = controller.busy || selection?.attempted === true
  return (
    <BottomDrawer visible={selection !== null} onClose={close} fillAvailable>
      {selection ? (
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Create related conversation</Text>
            <CloseButton onPress={close} />
          </View>
          <Text style={styles.subtitle}>
            History ends at this response. Files stay at their current state; no checkout or reset
            is performed.
          </Text>
          {selection.branch ? (
            <>
              <Text accessibilityRole="alert" style={styles.status}>
                {mobileConversationBranchStateLabel(selection.branch)}
              </Text>
              {controller.error ? <Text style={styles.error}>{controller.error}</Text> : null}
              <BranchActions branch={selection.branch} controller={controller} />
            </>
          ) : (
            <>
              <Text style={styles.label}>Title</Text>
              <TextInput
                accessibilityLabel="Related conversation title"
                editable={!locked}
                value={selection.draft.title}
                onChangeText={(title) => controller.updateDraft({ title })}
                style={styles.input}
              />
              <Text style={styles.label}>Relationship</Text>
              <View style={styles.choiceRow}>
                {RELATIONS.map((relation) => (
                  <Choice
                    key={relation.id}
                    label={relation.label}
                    selected={selection.draft.relationKind === relation.id}
                    disabled={locked}
                    onPress={() => controller.updateDraft({ relationKind: relation.id })}
                  />
                ))}
              </View>
              <Text style={styles.label}>Target workspace</Text>
              <View style={styles.choiceRow}>
                {selection.workspaces.map((workspace) => (
                  <Choice
                    key={workspace.id}
                    label={`${workspace.label}${workspace.kind === 'folder' ? ' · Folder' : ''}`}
                    selected={selection.draft.targetWorkspaceId === workspace.id}
                    disabled={locked}
                    onPress={() => controller.updateDraft({ targetWorkspaceId: workspace.id })}
                  />
                ))}
              </View>
              <Text style={styles.label}>Context</Text>
              <View style={styles.choiceRow}>
                <Choice
                  label="Preserve history"
                  selected={selection.draft.mode === 'preserve-history'}
                  disabled={
                    locked ||
                    !selection.preview.nativeProviderForkSupported ||
                    !selection.preview.historyPreviewSha256
                  }
                  onPress={() => controller.updateDraft({ mode: 'preserve-history' })}
                />
                <Choice
                  label="Targeted handoff"
                  selected={selection.draft.mode === 'targeted'}
                  disabled={locked}
                  onPress={() => controller.updateDraft({ mode: 'targeted' })}
                />
              </View>
              {selection.draft.mode === 'preserve-history' ? (
                <>
                  <View style={styles.preview}>
                    <Text selectable style={styles.previewText}>
                      {selection.preview.historyPreview}
                    </Text>
                  </View>
                  <TextInput
                    accessibilityLabel="Instruction sent when work starts"
                    editable={!locked}
                    multiline
                    value={selection.draft.instruction}
                    onChangeText={(instruction) => controller.updateDraft({ instruction })}
                    style={[styles.input, styles.textArea]}
                  />
                </>
              ) : (
                <TextInput
                  accessibilityLabel="Exact handoff content"
                  editable={!locked}
                  multiline
                  value={selection.draft.content}
                  onChangeText={(content) => controller.updateDraft({ content })}
                  style={[styles.input, styles.textArea]}
                />
              )}
              {selection.preview.historyPreviewUnavailableReason ? (
                <Text style={styles.subtitle}>
                  The history is too large. Review the targeted handoff before preparing.
                </Text>
              ) : !selection.preview.nativeProviderForkSupported ? (
                <Text style={styles.subtitle}>
                  Native history preservation is unavailable. Review the targeted handoff.
                </Text>
              ) : null}
              {controller.error ? <Text style={styles.error}>{controller.error}</Text> : null}
              <View style={styles.buttonRow}>
                <Button label="Close" disabled={controller.busy} onPress={close} />
                <Button
                  label={selection.attempted ? 'Check preparation' : 'Prepare'}
                  primary
                  disabled={controller.busy || !controller.canPrepare}
                  onPress={controller.prepare}
                />
              </View>
            </>
          )}
          {controller.busy ? <ActivityIndicator color={colors.textSecondary} /> : null}
        </View>
      ) : null}
    </BottomDrawer>
  )
}

function FamilyDrawer({ controller }: { controller: MobileConversationBranchController }) {
  return (
    <BottomDrawer
      visible={controller.familyVisible}
      onClose={() => controller.setFamilyVisible(false)}
      fillAvailable
    >
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title}>Related conversations</Text>
          <CloseButton onPress={() => controller.setFamilyVisible(false)} />
        </View>
        {controller.error ? <Text style={styles.error}>{controller.error}</Text> : null}
        {controller.family.branches.length === 0 ? (
          <Text style={styles.subtitle}>Create one from an eligible completed response.</Text>
        ) : null}
        {controller.family.branches.map((branch) => (
          <View key={branch.branchId} style={styles.familyCard}>
            <Text style={styles.label}>{branch.title}</Text>
            <Text style={styles.familyMeta}>
              {branch.relationKind} · {branch.target.location.workspaceId}
            </Text>
            <Text style={styles.status}>{mobileConversationBranchStateLabel(branch)}</Text>
            <Text selectable numberOfLines={6} style={styles.familyHandoff}>
              {branch.handoff.content}
            </Text>
            <BranchActions branch={branch} controller={controller} />
          </View>
        ))}
        {controller.family.returns.length > 0 ? (
          <Text style={styles.title}>Returned results</Text>
        ) : null}
        {controller.family.returns.map((result) => (
          <View key={result.returnId} style={styles.familyCard}>
            <Text style={styles.label}>Saved result</Text>
            <Text style={styles.familyMeta}>
              {result.integrationState === 'integrated' ? 'Integrated' : 'Reported, not integrated'}{' '}
              · {result.delivery?.status === 'accepted' ? 'Delivered' : 'Delivery unconfirmed'}
            </Text>
            <Text selectable style={styles.familyHandoff}>
              {result.content}
            </Text>
          </View>
        ))}
        <View style={styles.buttonRow}>
          <Button label="Refresh" disabled={controller.busy} onPress={controller.refresh} />
        </View>
        {controller.busy ? <ActivityIndicator color={colors.textSecondary} /> : null}
      </View>
    </BottomDrawer>
  )
}

export function MobileConversationBranchDrawers({
  controller
}: {
  controller: MobileConversationBranchController
}) {
  return (
    <>
      <PreparationDrawer controller={controller} />
      <FamilyDrawer controller={controller} />
    </>
  )
}
