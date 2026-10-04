import { createServer } from 'node:http'

const body = Buffer.from(`<!doctype html><html><body>${'<li>x</li>'.repeat(1250)}</body></html>`)
createServer((_, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': body.length })
  res.end(body)
}).listen(Number(process.env.PORT), process.env.HOST)
