#!/usr/bin/env node
import { spawn } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const VIEWPORTS = [
  ["desktop", 1440, 900, 1, false],
  ["mobile", 390, 844, 2, true],
].map(([name, width, height, deviceScaleFactor, mobile]) => ({
  name,
  width,
  height,
  deviceScaleFactor,
  mobile,
}))

function parseArgs(argv) {
  return Object.fromEntries(
    argv
      .slice(2)
      .flatMap((v, i, arr) =>
        v.startsWith("--") ? [[v.slice(2), arr[i + 1]]] : []
      )
  )
}

class CDPClient {
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
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        if (msg.error)
          reject(new Error(`${msg.error.message} (${msg.error.code})`))
        else resolve(msg.result || {})
      } else if (msg.method) {
        this.events.push(msg)
      }
    })
  }

  send(method, params = {}) {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
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

async function launchChrome(chromeBin, userDataDir) {
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
  const wsBrowserUrl = await new Promise((resolve, reject) => {
    let stderr = ""
    const timer = setTimeout(
      () => reject(new Error(`Chrome DevTools timeout: ${stderr}`)),
      15000
    )
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString()
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/)
      if (match) {
        clearTimeout(timer)
        resolve(match[1])
      }
    })
    proc.on("exit", (code) => {
      clearTimeout(timer)
      reject(new Error(`Chrome exited early (${code}): ${stderr}`))
    })
  })
  const httpBase = wsBrowserUrl
    .replace("ws://", "http://")
    .split("/devtools/")[0]
  const targets = await fetch(`${httpBase}/json/list`).then((r) => r.json())
  const page =
    targets.find((t) => t.type === "page") ||
    (await fetch(`${httpBase}/json/new?about:blank`).then((r) => r.json()))
  return { proc, wsUrl: page.webSocketDebuggerUrl }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitForCondition(client, expression, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs
  async function poll() {
    if (await client.evaluate(expression)) return true
    if (Date.now() >= deadline) return false
    await sleep(200)
    return poll()
  }
  return poll()
}

function buildSpecs(baseUrl) {
  const hasSel = (s) => `Boolean(document.querySelector(${JSON.stringify(s)}))`
  const clickSel = (s) =>
    `(() => { const b = document.querySelector(${JSON.stringify(s)}); return b ? (b.click(), true) : false; })()`
  return [
    ["landing", "/", 'document.body?.innerText.includes("Diffly")'],
    [
      "challenges",
      "/challenges",
      `${hasSel('[data-testid="generate-ai-challenge-btn"]')} && document.body.innerText.includes("Challenge Catalog")`,
    ],
    [
      "challenge_detail",
      "/challenges/agent-unsanitized-exec",
      'document.body?.innerText.includes("Unsanitized") || document.body?.innerText.includes("Submit Review")',
    ],
    [
      "auth_modal",
      "/challenges",
      hasSel('[data-testid="sign-in-button"]'),
      '[data-testid="sign-in-button"]',
      '[data-testid="auth-modal-content"]',
    ],
    [
      "custom_modal",
      "/challenges",
      hasSel('[data-testid="generate-ai-challenge-btn"]'),
      '[data-testid="generate-ai-challenge-btn"]',
      '[data-testid="custom-challenge-modal-content"]',
    ],
  ].map(([name, route, readyExpr, triggerSel, modalSel]) => ({
    name,
    url: `${baseUrl}${route}`,
    readyExpr,
    actionExpr: triggerSel ? clickSel(triggerSel) : null,
    postExpr: modalSel ? hasSel(modalSel) : null,
    viewportOnly: Boolean(modalSel),
  }))
}

async function captureState(client, viewport, spec, outPath) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: viewport.deviceScaleFactor,
    mobile: viewport.mobile,
  })
  client.events = []
  await client.send("Page.navigate", { url: spec.url })
  const readyOk = await waitForCondition(
    client,
    `document.readyState === "complete" && (${spec.readyExpr})`,
    30000
  )
  if (!readyOk) throw new Error(`Timed out on ${spec.name} (${spec.url})`)
  await client.evaluate(
    "document.fonts ? document.fonts.ready.then(() => true) : true"
  )
  await sleep(600)

  if (spec.actionExpr) {
    if (!(await client.evaluate(spec.actionExpr)))
      throw new Error(`Interaction failed for ${spec.name} (${viewport.name})`)
    if (!(await waitForCondition(client, spec.postExpr, 10000)))
      throw new Error(`Post-action missing for ${spec.name} (${viewport.name})`)
    await sleep(350)
  }

  const metrics = await client.evaluate(`(() => {
    const text = (document.body?.innerText || "").trim();
    const hasNextError = Boolean(document.querySelector("nextjs-portal")?.shadowRoot?.querySelector("[data-nextjs-dialog]"));
    return {
      title: document.title,
      textLength: text.length,
      requestedWidth: ${viewport.width},
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth || document.documentElement.scrollWidth > ${viewport.width},
      hasNextError,
    };
  })()`)

  const consoleErrors = client.events
    .filter(
      (e) =>
        (e.method === "Runtime.consoleAPICalled" &&
          e.params?.type === "error") ||
        e.method === "Runtime.exceptionThrown"
    )
    .map((e) => {
      if (e.method === "Runtime.exceptionThrown") {
        const d = e.params?.exceptionDetails
        return (
          d?.exception?.description ||
          d?.exception?.value ||
          d?.text ||
          "Runtime exception"
        )
      }
      return (e.params?.args || [])
        .map((a) => a.value || a.description)
        .join(" ")
    })

  const findings = [
    metrics.hasHorizontalOverflow && "horizontal_overflow",
    metrics.hasNextError && "next_error_overlay",
    consoleErrors.length > 0 && "console_errors",
  ].filter(Boolean)

  const shot = await client.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: !spec.viewportOnly,
  })
  fs.writeFileSync(outPath, Buffer.from(shot.data, "base64"))
  const verdict =
    metrics.textLength > 40 && findings.length === 0 ? "CAPTURED" : "FAILED"

  return {
    state: spec.name,
    viewport: viewport.name,
    url: spec.url,
    screenshot: path.basename(outPath),
    metrics,
    consoleErrors,
    findings,
    verdict,
  }
}

async function main() {
  const args = parseArgs(process.argv)
  const baseUrl = (args["base-url"] || "").replace(/\/$/, "")
  const evidenceDir = args["evidence-dir"]
  const timestamp =
    args.timestamp || new Date().toISOString().replace(/[-:.]/g, "")
  if (!baseUrl || !evidenceDir) {
    process.stderr.write(
      "Usage: capture_visual.mjs --base-url <url> --evidence-dir <dir> --timestamp <ts>\n"
    )
    process.exit(1)
  }
  const chromeBin = [
    process.env.CHROME_BIN,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].find((p) => p && fs.existsSync(p))
  if (!chromeBin) {
    process.stderr.write("ERROR: No headless Chrome/Chromium binary found.\n")
    process.exit(1)
  }

  fs.mkdirSync(evidenceDir, { recursive: true })
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "diffly-cdp-"))
  let chromeProc = null
  let client = null
  try {
    const launched = await launchChrome(chromeBin, userDataDir)
    chromeProc = launched.proc
    client = new CDPClient(launched.wsUrl)
    await client.connect()
    await client.send("Page.enable")
    await client.send("Runtime.enable")
    await client.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    })
    await client.send("Page.navigate", { url: `${baseUrl}/` })
    await waitForCondition(client, 'document.readyState === "complete"', 15000)
    await client.evaluate(
      'window.localStorage.setItem("diffly_has_seen_flag_guide", "true"); true'
    )

    const tasks = VIEWPORTS.flatMap((viewport) =>
      buildSpecs(baseUrl).map((spec) => ({ viewport, spec }))
    )
    const captures = await tasks.reduce(
      async (prevPromise, { viewport, spec }) => {
        const acc = await prevPromise
        const outFile = `${timestamp}_visual_${spec.name}_${viewport.name}.png`
        const result = await captureState(
          client,
          viewport,
          spec,
          path.join(evidenceDir, outFile)
        )
        process.stdout.write(
          `[visual:${spec.name}:${viewport.name}] ${result.verdict} -> ${outFile} (overflow=${result.metrics.hasHorizontalOverflow}, nextError=${result.metrics.hasNextError}, errors=${result.consoleErrors.length})\n`
        )
        return [...acc, result]
      },
      Promise.resolve([])
    )

    const failed = captures.filter((c) => c.verdict !== "CAPTURED")
    const withFindings = captures.filter((c) => c.findings.length > 0)
    const manifestPath = path.join(evidenceDir, `${timestamp}_visual.json`)
    const allClean = failed.length === 0 && withFindings.length === 0
    const manifest = {
      feature: "visual-review",
      timestamp,
      browser: chromeBin,
      base_url: baseUrl,
      verdict: allClean ? "CAPTURED" : "FAILED",
      total_captures: captures.length,
      captures_with_findings: withFindings.length,
      captures,
    }
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n")
    process.stdout.write(`Visual manifest recorded to ${manifestPath}\n`)
    if (!allClean) process.exitCode = 1
  } finally {
    if (client) client.close()
    if (
      chromeProc &&
      chromeProc.exitCode === null &&
      chromeProc.signalCode === null
    ) {
      await new Promise((resolve) => {
        chromeProc.once("exit", resolve)
        setTimeout(resolve, 2000)
        chromeProc.kill("SIGKILL")
      })
    }
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true })
    } catch {}
  }
}

main().catch((err) => {
  process.stderr.write(`Visual capture error: ${err.message}\n`)
  process.exit(1)
})
