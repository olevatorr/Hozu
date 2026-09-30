# Contracts

A transition that **decides** needs a contract: a guard, a `navigate`, or a `fn()`, a comparison or a computing
operator (`+ - ?? ?: .length .includes`) in its values (HZ016 prints each missing one, ready to paste). Transitions that
only copy values need none (a contract there is HZ058). `hozu.lock.json` records every transition readably and must
equal the computed lock: any difference is HZ057 until `hozu check --update-lock` accepts it; then list the accepted
`now:` lines in your summary. A deciding change also needs a contract that fails against the old behaviour (HZ018);
renaming or copying a contract does not count.
```ts
export const addsValid = contract(m, {
  given: { state: 'idle' },                          // context: initialContext; { touring: true } overrides fields
  when: [
    { send: Add, payload: { title: 'Milk' } },
    { done: addItem, result: { id: 'i9', title: 'Milk', done: false } },
  ],                                                 // or { failed: addItem, error: 'Duplicate', data } / { elapse: ms }
  expect: {
    state: 'idle',
    changes: { draft: '' },                          // only what changes; nested objects are patches
    effects: [{ effect: addItem, input: { title: 'Milk' } }, { navigate: '/items/i9' }],  // default: none
  },
})
```
Export contracts from `views.ts` (or any module the feature lists). When a contract fails (HZ015), decide which is intended — the
machine or the contract — before changing either.
