import { definePlugin } from '@oxlint/plugins'
import { traitorRule } from './rule.ts'

export default definePlugin({
  meta: { name: 'traitor' },
  rules: {
    fail: traitorRule('fail'),
    review: traitorRule('review'),
  },
})
