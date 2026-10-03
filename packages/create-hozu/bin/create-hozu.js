#!/usr/bin/env node
const [major, minor] = process.versions.node.split('.').map(Number)
if (major < 22 || (major === 22 && minor < 18)) {
  console.error(
    `create-hozu needs Node 22.18 or newer (it runs TypeScript with Node's type stripping); this is Node ${process.versions.node}.\nInstall it from https://nodejs.org, or with nvm: nvm install 22 && nvm use 22`,
  )
  process.exit(1)
}
const { main } = await import('../dist/bin.js')
process.exitCode = await main(process.argv.slice(2))
