import { ui } from '@hozu/core'

export const text = ui.messages('en', {
  en: {
    title: 'Hozu Blog — notes on AI-first frontends',
    description: 'Articles about building verifiable, AI-friendly web apps with Hozu.',
    heading: 'Hozu Blog',
    languages: 'Language',
    loading: 'Loading posts…',
    unavailable: 'Posts are unavailable',
    byline: 'By {author} · {date}',
    notFound: 'Post not found',
    postUnavailable: 'Post unavailable',
    offline: 'You are offline',
    offlineHint: 'This page will come back when your connection does.',
  },
  'zh-TW': {
    title: 'Hozu 部落格 — AI 優先前端筆記',
    description: '用 Hozu 打造可驗證、對 AI 友善的網頁應用。',
    heading: 'Hozu 部落格',
    languages: '語言',
    loading: '文章載入中…',
    unavailable: '目前無法取得文章',
    byline: '{author} · {date}',
    notFound: '找不到這篇文章',
    postUnavailable: '目前無法顯示這篇文章',
    offline: '目前離線',
    offlineHint: '恢復連線後就能繼續閱讀。',
  },
})
