import { APP_MENU_VIEW_ITEMS, type AppMenuViewItem } from '../../shared/app-menu-views'
import type { KeybindingOverrides } from '../../shared/keybindings'
import { translateMain } from '../i18n/main-i18n'
import { appMenuShortcutHint } from './app-menu-shortcut-hint'

export type AppMenuViewItemsOptions = {
  onOpenView: (viewId: string, window?: Electron.BaseWindow | null) => void
  getKeybindings?: () => KeybindingOverrides | undefined
  items?: readonly AppMenuViewItem[]
}

/** The registered views of one menu, each opening its target in the window the click came from. */
export function createAppMenuViewItems(
  menu: AppMenuViewItem['menu'],
  { onOpenView, getKeybindings, items = APP_MENU_VIEW_ITEMS }: AppMenuViewItemsOptions
): Electron.MenuItemConstructorOptions[] {
  const overrides = getKeybindings?.()
  return items
    .filter((item) => item.menu === menu)
    .map((item) => {
      const label = translateMain(item.labelKey, item.label)
      const hint = appMenuShortcutHint(item.shortcutActionId, overrides)
      return {
        // Why: display-only hint, never `accelerator` — that would take the chord in main before the renderer's keybinding dispatch.
        label: hint ? `${label}\t${hint}` : label,
        click: (_menuItem, window) => onOpenView(item.id, window)
      }
    })
}

/** The top-level Review menu; omitted while no review view is registered. */
export function createAppReviewMenu(
  options: AppMenuViewItemsOptions
): Electron.MenuItemConstructorOptions[] {
  const submenu = createAppMenuViewItems('review', options)
  return submenu.length > 0 ? [{ label: translateMain('menu.review', 'Review'), submenu }] : []
}

/** View-menu block for the registered panels, with its trailing separator. */
export function createAppViewMenuPanelItems(
  options: AppMenuViewItemsOptions
): Electron.MenuItemConstructorOptions[] {
  const items = createAppMenuViewItems('view', options)
  return items.length > 0 ? [...items, { type: 'separator' }] : []
}
