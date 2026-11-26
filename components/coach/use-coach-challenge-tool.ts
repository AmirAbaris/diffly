"use client"

import * as React from "react"
import { useCustomChallenges } from "@/hooks/use-custom-challenges"
import {
  COACH_CONFIGURE_CHALLENGE_TOOL_NAME,
  type CoachUIMessage,
  type ConfigureChallengeOutput,
} from "@/lib/ai/coach"
import { resolveChallengeGenerationError } from "@/lib/ai/coach-errors"
import type { GenerateCustomChallengePayload } from "@/types/challenge"

export type ChallengeToolCallStatus =
  { kind: "idle" } | { kind: "generating" } | { kind: "error"; message: string }

export interface CoachChallengeToolController {
  quota: {
    total: number
    quotaLimit: number
    isQuotaFull: boolean
  }
  getCallStatus: (toolCallId: string) => ChallengeToolCallStatus
  submitConfig: (
    toolCallId: string,
    payload: GenerateCustomChallengePayload
  ) => Promise<void>
  cancelConfig: (toolCallId: string) => void
  reportQuotaFull: (toolCallId: string) => void
}

export type AddConfigureChallengeOutput = (params: {
  tool: typeof COACH_CONFIGURE_CHALLENGE_TOOL_NAME
  toolCallId: string
  output: ConfigureChallengeOutput
}) => PromiseLike<void> | void

export interface UseCoachChallengeToolOptions {
  addToolOutput: AddConfigureChallengeOutput
}

export interface UseCoachChallengeToolResult {
  controller: CoachChallengeToolController
  hasPendingToolCalls: (messages: readonly CoachUIMessage[]) => boolean
  cancelPendingToolCalls: (messages: readonly CoachUIMessage[]) => Promise<void>
  resetToolState: () => void
}

const IDLE_STATUS: ChallengeToolCallStatus = { kind: "idle" }
const CONFIGURE_PART_TYPE =
  `tool-${COACH_CONFIGURE_CHALLENGE_TOOL_NAME}` as const

function collectPendingToolCallIds(
  messages: readonly CoachUIMessage[],
  resolved: ReadonlySet<string>
): string[] {
  const pending: string[] = []
  for (const message of messages) {
    if (message.role !== "assistant") continue
    for (const part of message.parts) {
      if (
        part.type === CONFIGURE_PART_TYPE &&
        part.state === "input-available" &&
        !resolved.has(part.toolCallId)
      ) {
        pending.push(part.toolCallId)
      }
    }
  }
  return pending
}

export function useCoachChallengeTool({
  addToolOutput,
}: UseCoachChallengeToolOptions): UseCoachChallengeToolResult {
  const { total, quotaLimit, isQuotaFull, generateCustomChallenge } =
    useCustomChallenges()
  const [statusByCallId, setStatusByCallId] = React.useState<
    Record<string, ChallengeToolCallStatus>
  >({})

  const inFlightRef = React.useRef<Set<string>>(new Set())
  const resolvedRef = React.useRef<Set<string>>(new Set())
  const epochRef = React.useRef(0)

  const clearStatus = React.useCallback((toolCallId: string) => {
    setStatusByCallId((prev) => {
      if (!(toolCallId in prev)) return prev
      const next = { ...prev }
      delete next[toolCallId]
      return next
    })
  }, [])

  const getCallStatus = React.useCallback(
    (toolCallId: string): ChallengeToolCallStatus =>
      statusByCallId[toolCallId] ?? IDLE_STATUS,
    [statusByCallId]
  )

  const submitConfig = React.useCallback(
    async (toolCallId: string, payload: GenerateCustomChallengePayload) => {
      if (
        inFlightRef.current.has(toolCallId) ||
        resolvedRef.current.has(toolCallId)
      ) {
        return
      }

      const epoch = epochRef.current
      inFlightRef.current.add(toolCallId)
      setStatusByCallId((prev) => ({
        ...prev,
        [toolCallId]: { kind: "generating" },
      }))

      try {
        const created = await generateCustomChallenge(payload)
        if (epochRef.current !== epoch) return

        resolvedRef.current.add(toolCallId)
        clearStatus(toolCallId)
        void addToolOutput({
          tool: COACH_CONFIGURE_CHALLENGE_TOOL_NAME,
          toolCallId,
          output: {
            status: "created",
            slug: created.slug,
            title: created.title,
            language: payload.language,
            difficulty: payload.difficulty,
            topic: payload.topic,
          },
        })
      } catch (err: unknown) {
        if (epochRef.current !== epoch) return
        setStatusByCallId((prev) => ({
          ...prev,
          [toolCallId]: {
            kind: "error",
            message: resolveChallengeGenerationError(err),
          },
        }))
      } finally {
        inFlightRef.current.delete(toolCallId)
      }
    },
    [addToolOutput, clearStatus, generateCustomChallenge]
  )

  const cancelConfig = React.useCallback(
    (toolCallId: string) => {
      if (
        inFlightRef.current.has(toolCallId) ||
        resolvedRef.current.has(toolCallId)
      ) {
        return
      }
      resolvedRef.current.add(toolCallId)
      clearStatus(toolCallId)
      void addToolOutput({
        tool: COACH_CONFIGURE_CHALLENGE_TOOL_NAME,
        toolCallId,
        output: { status: "cancelled" },
      })
    },
    [addToolOutput, clearStatus]
  )

  const reportQuotaFull = React.useCallback(
    (toolCallId: string) => {
      if (
        inFlightRef.current.has(toolCallId) ||
        resolvedRef.current.has(toolCallId)
      ) {
        return
      }
      resolvedRef.current.add(toolCallId)
      clearStatus(toolCallId)
      void addToolOutput({
        tool: COACH_CONFIGURE_CHALLENGE_TOOL_NAME,
        toolCallId,
        output: { status: "quota_full", quotaLimit },
      })
    },
    [addToolOutput, clearStatus, quotaLimit]
  )

  const hasPendingToolCalls = React.useCallback(
    (messages: readonly CoachUIMessage[]) =>
      collectPendingToolCallIds(messages, resolvedRef.current).length > 0,
    []
  )

  const cancelPendingToolCalls = React.useCallback(
    async (messages: readonly CoachUIMessage[]) => {
      const pendingIds = collectPendingToolCallIds(
        messages,
        resolvedRef.current
      )
      if (pendingIds.length === 0) return

      const tasks: Array<PromiseLike<void> | void> = []
      for (const toolCallId of pendingIds) {
        resolvedRef.current.add(toolCallId)
        clearStatus(toolCallId)
        tasks.push(
          addToolOutput({
            tool: COACH_CONFIGURE_CHALLENGE_TOOL_NAME,
            toolCallId,
            output: { status: "cancelled" },
          })
        )
      }
      await Promise.all(tasks)
    },
    [addToolOutput, clearStatus]
  )

  const resetToolState = React.useCallback(() => {
    epochRef.current += 1
    inFlightRef.current.clear()
    resolvedRef.current.clear()
    setStatusByCallId({})
  }, [])

  const controller = React.useMemo<CoachChallengeToolController>(
    () => ({
      quota: { total, quotaLimit, isQuotaFull },
      getCallStatus,
      submitConfig,
      cancelConfig,
      reportQuotaFull,
    }),
    [
      cancelConfig,
      getCallStatus,
      isQuotaFull,
      quotaLimit,
      reportQuotaFull,
      submitConfig,
      total,
    ]
  )

  return {
    controller,
    hasPendingToolCalls,
    cancelPendingToolCalls,
    resetToolState,
  }
}
