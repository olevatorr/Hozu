import { ui } from '@tenonkit/core'

export const text = ui.messages('en', {
  en: {
    heading: 'Your reading list',
    save: 'Save',
    remove: 'Remove',
    count: '{count, plural, =0 {Nothing saved yet} one {# post saved} other {# posts saved}}',
    loading: 'Loading your list…',
    saving: 'Saving…',
    unavailable: 'Could not load your list',
    postsUnavailable: 'Posts unavailable',
  },
  'zh-TW': {
    heading: '我的閱讀清單',
    save: '儲存',
    remove: '移除',
    count: '{count, plural, =0 {還沒有儲存任何文章} other {已儲存 # 篇}}',
    loading: '清單載入中…',
    saving: '儲存中…',
    unavailable: '無法載入你的清單',
    postsUnavailable: '目前無法取得文章',
  },
})
