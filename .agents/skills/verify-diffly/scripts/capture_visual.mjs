#!/usr/bin/env node
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  CDPClient,
  launchChrome,
  sleep,
  waitForCondition,
} from "./cdp_client.mjs"

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

const BOOLEAN_FLAGS = new Set(["ephemeral"])

function parseArgs(argv) {
  const args = {}
  const rest = argv.slice(2)
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i]
    if (!token.startsWith("--")) continue
    const eqIdx = token.indexOf("=")
    if (eqIdx !== -1) {
      const key = token.slice(2, eqIdx)
      args[key] = token.slice(eqIdx + 1)
      continue
    }
    const key = token.slice(2)
    if (BOOLEAN_FLAGS.has(key)) {
      args[key] = true
      continue
    }
    const next = rest[i + 1]
    if (next !== undefined && !next.startsWith("--")) {
      args[key] = next
      i += 1
    } else {
      args[key] = true
    }
  }
  return args
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
  const rawBaseUrl = typeof args["base-url"] === "string" ? args["base-url"] : ""
  const baseUrl = rawBaseUrl.replace(/\/$/, "")
  const evidenceDir =
    typeof args["evidence-dir"] === "string" ? args["evidence-dir"] : ""
  const timestamp =
    typeof args.timestamp === "string"
      ? args.timestamp
      : new Date().toISOString().replace(/[-:.]/g, "")
  const ephemeral =
    args.ephemeral === true ||
    args.ephemeral === "true" ||
    args.ephemeral === "1" ||
    process.env.VERIFY_EPHEMERAL_SCREENSHOTS === "1"
  if (!baseUrl || !evidenceDir) {
    process.stderr.write(
      "Usage: capture_visual.mjs --base-url <url> --evidence-dir <dir> [--screenshot-dir <dir>] [--timestamp <ts>] [--ephemeral]\n"
    )
    process.exit(1)
  }
  const skillRoot = path.dirname(path.resolve(evidenceDir))
  const screenshotDir =
    typeof args["screenshot-dir"] === "string"
      ? path.resolve(args["screenshot-dir"])
      : path.join(skillRoot, ".screenshots", timestamp)
  const relScreenshotDir = path.relative(skillRoot, screenshotDir)
  const manifestScreenshotDir =
    relScreenshotDir &&
    !relScreenshotDir.startsWith("..") &&
    !path.isAbsolute(relScreenshotDir)
      ? relScreenshotDir
      : screenshotDir
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
  const screenshotDirExisted = fs.existsSync(screenshotDir)
  fs.mkdirSync(screenshotDir, { recursive: true })
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "diffly-cdp-"))
  const writtenFiles = []
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
        const outPath = path.join(screenshotDir, outFile)
        const result = await captureState(client, viewport, spec, outPath)
        writtenFiles.push(outPath)
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
      screenshot_dir: manifestScreenshotDir,
      ephemeral_screenshots: true,
      screenshots_retained: !ephemeral,
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
    if (ephemeral) {
      for (const file of writtenFiles) {
        try {
          fs.rmSync(file, { force: true })
        } catch {}
      }
      if (!screenshotDirExisted) {
        try {
          fs.rmdirSync(screenshotDir)
        } catch {}
      }
    }
  }
}

main().catch((err) => {
  process.stderr.write(`Visual capture error: ${err.message}\n`)
  process.exit(1)
})
