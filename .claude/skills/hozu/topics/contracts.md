# Contracts

A transition that **decides** (a guard, a `navigate`, a `fn()`, a comparison or a computing operator in its values)
needs a contract; HZ016 prints each missing one, ready to paste:
`contract(m, { given: { state }, when: [{ send: Event, payload }], expect: { state, changes, effects } })`
(full example: see --more). Export it from `views.ts`. After a behaviour change, run `hozu check --update-lock`
and list the accepted `now:` lines in your summary. When a contract fails (HZ015), decide which is intended before
changing either.

<!-- more -->

- Computing operators: `+ - ?? ?: .length .includes`. Transitions that only copy values need no contract (a contract
  there is HZ058).
- `hozu.lock.json` records every transition readably and must equal the computed lock: any difference is HZ057
  until `hozu check --update-lock` accepts it.
- A deciding change also needs a contract that fails against the old behaviour (HZ018); renaming or copying a
  contract does not count.
- Contracts may be exported from any module the feature lists. When one fails, the choice is between the machine
  and the contract.
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
