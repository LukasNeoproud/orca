import { useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { ChevronDown, Combine, ListTree, Pencil, Scissors } from 'lucide-react-native'
import type { AgentJournalRenderItem } from '../../../src/shared/agent-session-journal-types'
import {
  mergeStructuredTopicChapters,
  renameStructuredTopicChapter,
  splitStructuredTopicChapter,
  type StructuredTopicAnchor,
  type StructuredTopicIndex
} from '../../../src/shared/structured-topic-index'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'
import { structuredSessionRandomUuid } from './mobile-structured-agent-session-rpc'

export function MobileStructuredTopicIndexPanel(props: {
  index: StructuredTopicIndex
  ready: boolean
  error: string | null
  epoch: string | null
  items: readonly AgentJournalRenderItem[]
  onNavigate: (anchor: StructuredTopicAnchor) => void
  onSave: (index: StructuredTopicIndex) => void
  onLoadOlder: () => void
}): React.JSX.Element {
  const { index, ready, error, epoch, items, onNavigate, onSave, onLoadOlder } = props
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [splitting, setSplitting] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const userTurns = useMemo(
    () => items.filter((item) => item.body.kind === 'message' && item.body.role === 'user'),
    [items]
  )
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Topics"
          accessibilityState={{ expanded }}
          onPress={() => setExpanded((value) => !value)}
          style={styles.headerButton}
        >
          <ListTree size={14} color={colors.textMuted} />
          <Text style={styles.headerText}>Topics</Text>
          <ChevronDown
            size={14}
            color={colors.textMuted}
            style={expanded ? styles.expandedChevron : undefined}
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            index.automatic ? 'Disable automatic topics' : 'Enable automatic topics'
          }
          disabled={!ready}
          onPress={() =>
            onSave({ ...index, revision: index.revision + 1, automatic: !index.automatic })
          }
          style={[styles.modeButton, !ready && styles.disabled]}
        >
          <Text style={styles.modeText}>{index.automatic ? 'Auto' : 'Manual'}</Text>
        </Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {expanded ? (
        <ScrollView style={styles.list} nestedScrollEnabled>
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          {index.chapters.length === 0 ? (
            <Text style={styles.notice}>Topics appear as conversation turns finish.</Text>
          ) : null}
          {index.chapters.map((chapter, position) => (
            <View key={chapter.id} style={styles.chapter}>
              <View style={styles.chapterRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Go to topic ${chapter.title}`}
                  style={styles.chapterTitleButton}
                  onPress={() => {
                    if (chapter.start.epoch !== epoch) {
                      setNotice('This topic belongs to an earlier conversation history.')
                      return
                    }
                    setNotice(null)
                    onNavigate(chapter.start)
                  }}
                >
                  <Text style={styles.chapterNumber}>{position + 1}</Text>
                  <Text style={styles.chapterTitle} numberOfLines={1}>
                    {chapter.title}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Rename topic ${chapter.title}`}
                  disabled={!ready}
                  style={styles.iconButton}
                  onPress={() => {
                    setEditing(chapter.id)
                    setTitle(chapter.title)
                    setSplitting(null)
                  }}
                >
                  <Pencil size={14} color={colors.textMuted} />
                </Pressable>
                {position < index.chapters.length - 1 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Merge topic ${chapter.title} with next topic`}
                    disabled={!ready}
                    style={styles.iconButton}
                    onPress={() =>
                      onSave(
                        mergeStructuredTopicChapters(
                          index,
                          chapter.id,
                          index.chapters[position + 1]!.id
                        )
                      )
                    }
                  >
                    <Combine size={14} color={colors.textMuted} />
                  </Pressable>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Split topic ${chapter.title}`}
                  disabled={!ready}
                  style={styles.iconButton}
                  onPress={() => {
                    setSplitting(chapter.id)
                    setEditing(null)
                  }}
                >
                  <Scissors size={14} color={colors.textMuted} />
                </Pressable>
              </View>
              {editing === chapter.id ? (
                <View style={styles.editRow}>
                  <TextInput
                    accessibilityLabel="Topic title"
                    value={title}
                    onChangeText={setTitle}
                    maxLength={120}
                    style={styles.input}
                    placeholderTextColor={colors.textMuted}
                    onSubmitEditing={() => {
                      onSave(renameStructuredTopicChapter(index, chapter.id, title))
                      setEditing(null)
                    }}
                  />
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      onSave(renameStructuredTopicChapter(index, chapter.id, title))
                      setEditing(null)
                    }}
                  >
                    <Text style={styles.actionText}>Save</Text>
                  </Pressable>
                </View>
              ) : null}
              {splitting === chapter.id ? (
                <View style={styles.splitList}>
                  <Text style={styles.notice}>Split at a user turn</Text>
                  {userTurns
                    .filter(
                      (item) =>
                        item.sequence > chapter.start.sequence &&
                        item.sequence <= chapter.end.sequence &&
                        chapter.start.epoch === epoch
                    )
                    .map((item) => (
                      <Pressable
                        key={item.itemId}
                        accessibilityRole="button"
                        onPress={() => {
                          onSave(
                            splitStructuredTopicChapter(
                              index,
                              chapter.id,
                              {
                                epoch: chapter.start.epoch,
                                itemId: item.itemId,
                                sequence: item.sequence
                              },
                              'New topic',
                              structuredSessionRandomUuid
                            )
                          )
                          setSplitting(null)
                        }}
                      >
                        <Text style={styles.splitText} numberOfLines={2}>
                          {item.body.kind === 'message'
                            ? item.body.blocks
                                .filter((block) => block.type === 'text')
                                .map((block) => block.text)
                                .join(' ')
                                .slice(0, 72) || item.itemId
                            : item.itemId}
                        </Text>
                      </Pressable>
                    ))}
                  <Pressable accessibilityRole="button" onPress={onLoadOlder}>
                    <Text style={styles.actionText}>Load earlier turns</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ))}
        </ScrollView>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerButton: {
    flex: 1,
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm
  },
  headerText: { flex: 1, color: colors.textSecondary, fontSize: typography.metaSize },
  expandedChevron: { transform: [{ rotate: '180deg' }] },
  modeButton: {
    minHeight: 28,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderRadius: radii.button,
    backgroundColor: colors.bgRaised
  },
  modeText: { color: colors.textSecondary, fontSize: typography.metaSize },
  disabled: { opacity: 0.45 },
  error: { color: colors.statusRed, fontSize: typography.metaSize },
  notice: { color: colors.textMuted, fontSize: typography.metaSize, paddingVertical: spacing.xs },
  list: { maxHeight: 220 },
  chapter: { paddingVertical: spacing.xs },
  chapterRow: { flexDirection: 'row', alignItems: 'center' },
  chapterTitleButton: { flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: 30 },
  chapterNumber: {
    minWidth: 22,
    color: colors.textMuted,
    fontSize: typography.metaSize,
    fontFamily: typography.monoFamily
  },
  chapterTitle: { flex: 1, color: colors.textSecondary, fontSize: typography.metaSize },
  iconButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: {
    flex: 1,
    minHeight: 34,
    color: colors.textPrimary,
    backgroundColor: colors.editorSurface,
    borderColor: colors.borderSubtle,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.input,
    paddingHorizontal: spacing.sm,
    fontSize: typography.metaSize
  },
  actionText: { color: colors.textSecondary, fontSize: typography.metaSize, padding: spacing.sm },
  splitList: { paddingLeft: spacing.md },
  splitText: {
    color: colors.textSecondary,
    fontSize: typography.metaSize,
    paddingVertical: spacing.sm
  }
})
