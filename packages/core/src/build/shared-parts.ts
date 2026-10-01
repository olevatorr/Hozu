import { join } from '../canonical/pointer.ts'
import type { PartUse, ProjectScope } from './scope.ts'

const pascal = (name: string) => `${name[0]!.toUpperCase()}${name.slice(1)}`

export function sharedPartSnippet(name: string, root: NonNullable<PartUse['root']>): string {
  return [
    `// a kit module listed in ui.kit({ components }); move the part's body into render and its parameters into props`,
    `export const ${name} = ui.component({`,
    `  tag: '${root.tag}',`,
    ...(root.class ? [`  styles: tv({ base: '${root.class}' }),`] : []),
    `  props: z.object({}),`,
    `  render: () => ui.${root.tag}({}, []),`,
    `})`,
    `// in each feature's view, in place of the part call:`,
    `ui.use(${name}, {})`,
  ].join('\n')
}

/** HZ080: a part that returns an element, references no declaration and is inlined by two or more features. */
export function reportSharedParts(scope: ProjectScope, features: Set<string>) {
  for (const use of scope.parts.values()) {
    const inlined = use.features.filter((f) => features.has(f))
    if (!use.root || use.declarations || inlined.length < 2) continue
    const name = use.name ?? 'part'
    const shown = inlined.slice(0, 3).join(', ') + (inlined.length > 3 ? `, +${inlined.length - 3}` : '')
    scope.report(
      'HZ080',
      inlined[0]!,
      join('', 'features', inlined[0]!),
      `${name} returns a view that ${shown} inline`,
      'A view fragment shared by features is a component in a kit, so the tools list it and its look is managed in one place (ADR 0045 K). A part stays the form inside one feature.',
      {
        summary: `Declare ${pascal(name)} with ui.component in a kit and use it through ui.use`,
        snippet: sharedPartSnippet(pascal(name), use.root),
        patch: null,
      },
      use.source,
    )
  }
}
