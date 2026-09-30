import assert from 'node:assert/strict'
import { test } from 'node:test'
import { categorizeV2 } from '../anatomy.mjs'
import { diagnosticsOf } from './diagnostics.mjs'

const bash = (command) => categorizeV2('Bash', { command })

test('anatomy v2 reads the leading command of each pipeline', () => {
  const cases = [
    [
      `node -v; "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --remote-debugging-port=9333 &`,
      'verify',
    ],
    [
      `for a in share unshare; do fn=$([ $a = share ] && echo x || echo y); cat > server/api/$a.post.ts <<EOF\nexport default 1\nEOF\ndone`,
      'edit',
    ],
    [`cd /tmp; rm -f a.jar; B=http://localhost:4801\nA=$(curl -s $B/login | grep -o 'action')`, 'verify'],
    [
      `args=(--field name=ada); for t in c d; do args+=(--next "POST /notes title=N$t&tags=w"); done\nnpx hozu post /login "\${args[@]}"`,
      'verify',
    ],
    ['npx hozu check 2>&1 | tail -3; git status --short', 'check'],
    ['cat .claude/skills/hozu/changing.md; npx hozu docs patterns', 'docs'],
    ['cat change.md && ls && cat package.json', 'spec'],
    ["cat >> features/notes/views.ts <<'EOF'\nexport const x = 1\nEOF", 'edit'],
    ["python3 - <<'EOF'\np='features/notes/model.ts'\ns=open(p).read()\nopen(p,'w').write(s)\nEOF", 'edit'],
    [
      "python3 - <<'EOF'\nimport urllib.request\nurllib.request.urlopen('http://localhost:4801/login')\nEOF",
      'verify',
    ],
    [
      '(PORT=4801 npm start > /tmp/srv.log 2>&1 & echo $! > /tmp/srv.pid); for i in $(seq 30); do curl -s localhost:4801/login && break; done',
      'serve',
    ],
    ['pnpm build 2>&1 | tail', 'check'],
    ["corepack pnpm exec hozu browse /login --do 'click Sign in'", 'verify'],
    ['grep -rn "hozu check" features', 'read'],
    ['echo "npx hozu check" > notes.txt', 'edit'],
    ['sed -n 1,20p features/notes/model.ts', 'read'],
    ["sed -i '' 's/a/b/' features/notes/model.ts && npx hozu check", 'edit'],
    [
      "cat > /tmp/cdp.mjs <<'EOF'\nconst ws = new WebSocket(x.webSocketDebuggerUrl)\nEOF\nnode /tmp/cdp.mjs",
      'verify',
    ],
    ['npx nuxt typecheck >/tmp/tc.log 2>&1; echo exit=$?', 'check'],
    [`L=$(python3 -c "print('a'*61)"); npx hozu browse / --do "fill Title=$L"`, 'verify'],
    ['npx hozu map | head -60', 'docs'],
    ['npx hozu --help', 'docs'],
    ['ls features && cat features/notes/model.ts', 'list'],
    ['npm install --no-audit', 'scaffold'],
    ['hozu serve', 'serve'],
    ['PID=$(lsof -ti tcp:4811 -sTCP:LISTEN); kill $PID', 'serve'],
  ]
  for (const [command, want] of cases) assert.equal(bash(command), want, command)
  assert.equal(categorizeV2('Read', { file_path: '/app/.claude/skills/hozu/SKILL.md' }), 'docs')
  assert.equal(categorizeV2('Read', { file_path: '/app/change.md' }), 'spec')
  assert.equal(categorizeV2('Edit', {}), 'edit')
})

const hz018 = (was, now) =>
  [
    `features/account/model.ts:33:9  error  HZ018  Behavior of idle/on/account.SignIn/0 changed but none of its contracts did`,
    '  at /features/account/machine/states/idle/on/account.SignIn/0',
    `  cause: Covered by signsIn; principle 5 requires … (was: ${was}; now: ${now}).`,
    '  see: hozu docs contracts',
  ].join('\n')

test('HZ018 and HZ057 are counted from check output only', () => {
  const docs = 'a change shows as HZ018 `was: … now: …` until hozu check --update-lock accepts it'
  const d = diagnosticsOf([
    { command: 'npx hozu docs contracts', text: `${docs}\n${hz018('a', 'a')}` },
    { command: 'npx hozu check', text: `${hz018('a', 'a')}\n\n${hz018('a', 'b')}\n✖ 2 errors` },
    {
      command: 'npx hozu check --json',
      text: JSON.stringify({
        validate: {
          diagnostics: [
            {
              code: 'HZ057',
              severity: 'error',
              message: 'lock out of date',
              cause: '',
              location: { pointer: '/m' },
            },
          ],
        },
      }),
    },
  ])
  assert.deepEqual(d.hz018, { count: 2, blocking: 2, warnings: 0, identical: 1, distinct: 1, runs: 1 })
  assert.equal(d.hz057.count, 1)
  assert.equal(d.checks, 2)
})
