import type { ActionResult } from '#shared/types/note'

export function useFormAction() {
  const route = useRoute()
  const router = useRouter()
  return async (event: SubmitEvent) => {
    const form = event.currentTarget as HTMLFormElement
    const body = new URLSearchParams(new FormData(form, event.submitter) as unknown as Record<string, string>)
    const { redirect } = await $fetch<ActionResult>(form.action, {
      method: 'POST',
      body,
      headers: { accept: 'application/json' },
    })
    if (router.resolve(redirect).fullPath === route.fullPath) await refreshNuxtData()
    else await navigateTo(redirect)
  }
}
