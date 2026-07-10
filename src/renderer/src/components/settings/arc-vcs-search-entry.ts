import type { SettingsSearchEntry } from './settings-search'
import { translate } from '@/i18n/i18n'
import { translateSearchKeyword } from './settings-search-keywords'

export function getArcVcsExperimentalSearchEntry(): SettingsSearchEntry {
  return {
    title: translate('auto.components.settings.experimental.search.arcVcs.title', 'Arc VCS'),
    description: translate(
      'auto.components.settings.experimental.search.arcVcs.description',
      'Route version-control operations through the Yandex arc CLI in arc working copies.'
    ),
    keywords: [
      ...translateSearchKeyword(
        'auto.components.settings.experimental.search.0d24759f14',
        'experimental'
      ),
      ...translateSearchKeyword('auto.components.settings.experimental.search.arcVcs.arc', 'arc'),
      ...translateSearchKeyword('auto.components.settings.experimental.search.arcVcs.vcs', 'vcs'),
      ...translateSearchKeyword(
        'auto.components.settings.experimental.search.arcVcs.arcadia',
        'arcadia'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.experimental.search.arcVcs.versionControl',
        'version control'
      )
    ]
  }
}
