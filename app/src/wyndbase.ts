import { wyndbaseSDK } from '@wyndbase/sdk/core'
import { Inbox } from '@wyndbase/sdk/plugins/inbox'
import { browserSession } from '@wyndbase/sdk/session/browser'
import type { WdbTypes } from '../wynhr.wql.gen'

/** WynHR web client on the `wynhr` base of dev.wyndbase.dev. */
export const url = 'wyndbase://wynhr-web@dev.wyndbase.dev/wynhr'

export const session = browserSession({ autoRegister: true })

export const wyndbase = new wyndbaseSDK<WdbTypes>(url, {
  onUnauthorized: () => {
    window.location.assign('/')
  },
  session,
}).use(Inbox) // the account inbox (interactions, assignments, mentions, alerts), pushed over its channels

/** One message per refusal: the engine's own text, which the named queries write for people. */
export function errorText(e: unknown): string {
  if (e && typeof e === 'object') {
    const anyE = e as { message?: string; value?: { error?: { message?: string } } }
    return anyE.value?.error?.message ?? anyE.message ?? String(e)
  }
  return String(e)
}
