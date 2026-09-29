let s = ''
process.stdin
  .on('data', (d) => (s += d))
  .on('end', () => {
    const j = JSON.parse(s)
    console.log(
      `step ${j.step}: ${j.passed}/${j.total} new ${j.new.passed}/${j.new.total} regression ${j.regression.passed}/${j.regression.total} js ${JSON.stringify(j.js)}`,
    )
    for (const f of j.failures) console.log(`  ${f.kind} ${f.id} ${f.what}: ${f.error}`)
  })
