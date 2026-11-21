"use client"

import * as React from "react"
import { ArrowDown, ArrowUp, Pencil, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  formatAnchor,
  SEVERITIES,
  type Finding,
  type Severity,
} from "@/lib/review"
import { useAnnotationLayer } from "./annotation-layer"

export interface FindingThreadEditorProps {
  finding: Finding
  editing: boolean
}

const SEVERITY_LABELS: Record<Severity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
}

export function FindingThreadEditor({
  finding,
  editing,
}: FindingThreadEditorProps) {
  const layer = useAnnotationLayer()
  const [draftBody, setDraftBody] = React.useState(finding.body)
  const [draftSeverity, setDraftSeverity] = React.useState<Severity | "none">(
    finding.severity ?? "none"
  )

  const handleSave = React.useCallback(() => {
    layer?.updateFinding?.(finding.id, {
      body: draftBody,
      severity: draftSeverity === "none" ? null : draftSeverity,
    })
    layer?.stopEdit?.()
  }, [draftBody, draftSeverity, finding.id, layer])

  const handleCancel = React.useCallback(() => {
    setDraftBody(finding.body)
    setDraftSeverity(finding.severity ?? "none")
    layer?.stopEdit?.()
  }, [finding.body, finding.severity, layer])

  if (!editing) {
    return (
      <div
        data-review-thread="true"
        data-testid={`finding-thread-${finding.id}`}
        className="my-1 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 font-sans text-xs"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Badge variant="warning" size="sm" className="font-mono tabular-nums">
            {formatAnchor(finding.anchor)}
          </Badge>
          {finding.severity && (
            <Badge variant="outline" size="sm" className="uppercase">
              {finding.severity}
            </Badge>
          )}
          <span className="truncate text-foreground">
            {finding.body.trim()
              ? finding.body
              : "No note added yet. Click Edit to describe the defect."}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => layer?.startEdit?.(finding.id)}
            aria-label={`Edit finding ${formatAnchor(finding.anchor)}`}
          >
            <Pencil aria-hidden="true" data-icon="inline-start" />
            <span>Edit</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => layer?.removeFinding?.(finding.id)}
            aria-label={`Remove finding ${formatAnchor(finding.anchor)}`}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 aria-hidden="true" data-icon="inline-start" />
            <span>Remove</span>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div
      data-review-thread="true"
      data-testid={`finding-thread-editor-${finding.id}`}
      className="my-1.5 flex flex-col gap-2.5 rounded-lg border border-border bg-card p-3 font-sans text-xs shadow-xs"
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault()
          e.stopPropagation()
          handleSave()
        } else if (e.key === "Escape") {
          e.preventDefault()
          e.stopPropagation()
          handleCancel()
        }
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="warning" size="sm" className="font-mono tabular-nums">
            {formatAnchor(finding.anchor)}
          </Badge>
          <Select
            value={draftSeverity}
            onValueChange={(val) => setDraftSeverity(val as Severity | "none")}
          >
            <SelectTrigger
              size="sm"
              aria-label="Finding severity"
              className="h-7 text-xs"
            >
              <SelectValue placeholder="Severity" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="none">No severity</SelectItem>
                {SEVERITIES.map((sev) => (
                  <SelectItem key={sev} value={sev}>
                    {SEVERITY_LABELS[sev]}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => layer?.extendFinding?.(finding.id, "up")}
            aria-label="Extend range up"
          >
            <ArrowUp aria-hidden="true" data-icon="inline-start" />
            <span>Extend</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => layer?.extendFinding?.(finding.id, "down")}
            aria-label="Extend range down"
          >
            <ArrowDown aria-hidden="true" data-icon="inline-start" />
            <span>Extend</span>
          </Button>
        </div>
      </div>

      <Textarea
        autoFocus
        value={draftBody}
        onChange={(e) => setDraftBody(e.target.value)}
        placeholder="Describe the defect, impact, and how to fix it…"
        aria-label={`Comment for ${formatAnchor(finding.anchor)}`}
        className="min-h-20 resize-y font-sans text-xs leading-relaxed"
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => layer?.removeFinding?.(finding.id)}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 aria-hidden="true" data-icon="inline-start" />
          <span>Remove</span>
        </Button>

        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={handleCancel}
          >
            Cancel
          </Button>
          <Button type="button" size="xs" onClick={handleSave}>
            Save
          </Button>
        </div>
      </div>
    </div>
  )
}
