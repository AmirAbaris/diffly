import { spawn } from "node:child_process"

export class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl
    this.ws = null
    this.nextId = 1
    this.pending = new Map()
    this.events = []
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl)
    await new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true })
      this.ws.addEventListener("error", reject, { once: true })
    })
    this.ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data)
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject, timer } = this.pending.get(msg.id)
        clearTimeout(timer)
        this.pending.delete(msg.id)
        if (msg.error)
          reject(new Error(`${msg.error.message} (${msg.error.code})`))
        else resolve(msg.result || {})
      } else if (msg.method) {
        this.events.push(msg)
      }
    })
    const failPending = (reason) => {
      for (const [id, entry] of this.pending.entries()) {
        clearTimeout(entry.timer)
        this.pending.delete(id)
        entry.reject(new Error(reason))
      }
    }
    this.ws.addEventListener("close", () => failPending("CDP WebSocket closed"))
    this.ws.addEventListener("error", () => failPending("CDP WebSocket error"))
  }

  send(method, params = {}, timeoutMs = 30000) {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`CDP command timed out: ${method}`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      try {
        this.ws.send(JSON.stringify({ id, method, params }))
      } catch (err) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(err)
      }
    })
  }

  async evaluate(expression) {
    const res = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.text || "Runtime evaluation failed")
    }
    return res.result ? res.result.value : undefined
  }

  close() {
    if (this.ws) this.ws.close()
  }
}

export async function launchChrome(chromeBin, userDataDir) {
  const flags = [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--remote-debugging-port=0",
    `--user-data-dir=${userDataDir}`,
    "about:blank",
  ]
  const proc = spawn(chromeBin, flags, { stdio: ["ignore", "pipe", "pipe"] })
  try {
    const wsBrowserUrl = await new Promise((resolve, reject) => {
      let stderr = ""
      let settled = false
      const finish = (err, val) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (err) reject(err)
        else resolve(val)
      }
      const timer = setTimeout(
        () => finish(new Error(`Chrome DevTools timeout: ${stderr}`)),
        15000
      )
      proc.stderr.on("data", (chunk) => {
        stderr += chunk.toString()
        const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/)
        if (match) finish(null, match[1])
      })
      proc.on("error", (err) => finish(err))
      proc.on("exit", (code) => {
        finish(new Error(`Chrome exited early (${code}): ${stderr}`))
      })
    })
    const httpBase = wsBrowserUrl
      .replace("ws://", "http://")
      .split("/devtools/")[0]
    const targets = await fetch(`${httpBase}/json/list`).then((r) => r.json())
    const page =
      targets.find((t) => t.type === "page") ||
      (await fetch(`${httpBase}/json/new?about:blank`, { method: "PUT" }).then(
        (r) => r.json()
      ))
    return { proc, wsUrl: page.webSocketDebuggerUrl }
  } catch (err) {
    if (proc.exitCode === null && proc.signalCode === null) {
      proc.kill("SIGKILL")
    }
    throw err
  }
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export async function waitForCondition(client, expression, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs
  async function poll() {
    if (await client.evaluate(expression)) return true
    if (Date.now() >= deadline) return false
    await sleep(200)
    return poll()
  }
  return poll()
}
