"use client"

import * as React from "react"
import { CoachContextPanel } from "@/components/coach/coach-context-panel"
import { CoachThreadList } from "@/components/coach/coach-thread-list"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { CoachPatternsSnapshot } from "@/lib/ai/coach"
import type { CoachThreadSummary } from "@/types/coach-thread"

export interface CoachRailTabsProps {
  patterns: CoachPatternsSnapshot | null
  patternsLoading: boolean
  contextDisabled?: boolean
  onSelectPrompt: (prompt: string) => void
  onCreateChallenge?: () => void
  threads: CoachThreadSummary[]
  threadsLoading: boolean
  activeThreadId: string | null
  onSelectThread: (threadId: string) => void
  onNewChat: () => void
  onRenameThread: (threadId: string, title: string) => Promise<unknown>
  onDeleteThread: (threadId: string) => Promise<void>
  defaultTab?: "chats" | "context"
}

export function CoachRailTabs({
  patterns,
  patternsLoading,
  contextDisabled = false,
  onSelectPrompt,
  onCreateChallenge,
  threads,
  threadsLoading,
  activeThreadId,
  onSelectThread,
  onNewChat,
  onRenameThread,
  onDeleteThread,
  defaultTab,
}: CoachRailTabsProps) {
  const [activeTab, setActiveTab] = React.useState<"chats" | "context">(
    defaultTab ?? (threads.length > 0 ? "chats" : "context")
  )

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => {
        if (value === "chats" || value === "context") {
          setActiveTab(value)
        }
      }}
      className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden"
    >
      <div className="flex h-13 shrink-0 items-center border-b border-border px-3">
        <TabsList className="h-8 w-full">
          <TabsTrigger
            value="chats"
            data-testid="coach-rail-tab-chats"
            className="text-xs"
          >
            <span>Chats</span>
            {threads.length > 0 ? (
              <Badge
                variant="secondary"
                size="sm"
                data-testid="coach-rail-threads-count"
                className="font-mono tabular-nums"
              >
                {threads.length}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger
            value="context"
            data-testid="coach-rail-tab-context"
            className="text-xs"
          >
            <span>Context</span>
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent
        value="chats"
        className="flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
      >
        <CoachThreadList
          threads={threads}
          activeThreadId={activeThreadId}
          isLoading={threadsLoading}
          onSelectThread={onSelectThread}
          onNewChat={onNewChat}
          onRenameThread={onRenameThread}
          onDeleteThread={onDeleteThread}
        />
      </TabsContent>

      <TabsContent
        value="context"
        className="flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
      >
        <CoachContextPanel
          patterns={patterns}
          isLoading={patternsLoading}
          disabled={contextDisabled}
          onSelectPrompt={onSelectPrompt}
          onCreateChallenge={onCreateChallenge}
        />
      </TabsContent>
    </Tabs>
  )
}

export type CoachContextRailProps = CoachRailTabsProps

export function CoachContextRail(props: CoachContextRailProps) {
  return (
    <aside
      aria-label="Coach sidebar"
      className="hidden w-72 shrink-0 flex-col border-r border-border bg-card/30 lg:flex"
    >
      <CoachRailTabs {...props} />
    </aside>
  )
}
