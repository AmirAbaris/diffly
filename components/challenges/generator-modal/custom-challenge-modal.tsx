"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import axios from "axios"
import { Sparkles } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CustomChallengesList } from "@/components/challenges/generator-modal/custom-challenges-list"
import {
  GeneratorForm,
  type GeneratorFormValues,
} from "@/components/challenges/generator-modal/generator-form"
import { GeneratorLoadingPhase } from "@/components/challenges/generator-modal/generator-loading-phase"
import { useCustomChallenges } from "@/hooks/use-custom-challenges"
import { toast } from "@/hooks/use-toast"
import {
  useCustomChallengeModalStore,
  type CustomChallengeTab,
} from "@/stores/custom-challenge-modal-store"

export interface CustomChallengeModalProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  initialTab?: CustomChallengeTab
}

export function CustomChallengeModal({
  open,
  onOpenChange,
  initialTab,
}: CustomChallengeModalProps) {
  const router = useRouter()
  const storeIsOpen = useCustomChallengeModalStore((s) => s.isOpen)
  const storeInitialTab = useCustomChallengeModalStore((s) => s.initialTab)
  const storeSetIsOpen = useCustomChallengeModalStore((s) => s.setIsOpen)

  const isControlled = open !== undefined
  const isModalOpen = isControlled ? open : storeIsOpen
  const defaultTab = initialTab ?? storeInitialTab

  const [tabOverride, setTabOverride] =
    React.useState<CustomChallengeTab | null>(null)
  const activeTab = tabOverride ?? defaultTab

  const [isGenerating, setIsGenerating] = React.useState(false)
  const [currentTopic, setCurrentTopic] = React.useState("")
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)

  const {
    customChallenges,
    total,
    quotaLimit,
    isQuotaFull,
    isLoading,
    deleteCustomChallenge,
    generateCustomChallenge,
  } = useCustomChallenges()

  const handleOpenChange = (newOpen: boolean) => {
    if (isGenerating) {
      // Prevent accidental dismissal while AI model generation is in flight
      return
    }
    setTabOverride(null)
    setErrorMessage(null)
    if (isControlled) {
      onOpenChange?.(newOpen)
    } else {
      storeSetIsOpen(newOpen)
    }
  }

  const handleClose = () => {
    handleOpenChange(false)
  }

  const handleGenerate = async (values: GeneratorFormValues) => {
    try {
      setIsGenerating(true)
      setCurrentTopic(values.topic)
      setErrorMessage(null)

      const generated = await generateCustomChallenge(
        {
          topic: values.topic,
          language: values.language,
          difficulty: values.difficulty,
        },
        values.apiKey
      )

      toast({
        title: "Challenge generated!",
        description: `"${generated.title}" is ready for code review.`,
        variant: "default",
      })

      setIsGenerating(false)
      handleClose()
      router.push(`/challenges/${generated.slug}`)
    } catch (err: unknown) {
      setIsGenerating(false)
      let message =
        "Failed to generate challenge. Please check your API key and try again."
      if (axios.isAxiosError(err)) {
        const detail = err.response?.data?.detail
        if (typeof detail === "string") {
          message = detail
        } else if (err.response?.status === 401) {
          message =
            "Invalid or expired Gemini API key. Please check your key at Google AI Studio."
        } else if (err.response?.status === 429) {
          message =
            "Gemini API rate limit reached. Please wait a minute and try again."
        } else if (err.response?.status === 400) {
          message =
            "Quota limit reached. Please delete an existing custom challenge first."
        }
      } else if (err instanceof Error) {
        message = err.message
      }
      setErrorMessage(message)
    }
  }

  return (
    <Dialog open={isModalOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-[500px]"
        data-testid="custom-challenge-modal-content"
      >
        <DialogHeader className="gap-1">
          <div className="flex items-center justify-between pr-4">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Sparkles aria-hidden="true" className="size-4" />
              </div>
              <DialogTitle className="text-base font-semibold tracking-tight">
                Custom Challenge Generator
              </DialogTitle>
            </div>
            <Badge
              variant={isQuotaFull ? "warning" : "outline"}
              className="text-xs tabular-nums"
              data-testid="modal-quota-badge"
            >
              {total}/{quotaLimit} Used
            </Badge>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Generate custom code review scenarios powered by Google Gemini
            (BYOK) and persisted to your private library.
          </DialogDescription>
        </DialogHeader>

        {isGenerating ? (
          <GeneratorLoadingPhase topic={currentTopic} />
        ) : (
          <Tabs
            value={activeTab}
            onValueChange={(val) => {
              setTabOverride(val as CustomChallengeTab)
              setErrorMessage(null)
            }}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger
                value="generate"
                data-testid="tab-generate-trigger"
                className="text-xs"
              >
                Create Challenge
              </TabsTrigger>
              <TabsTrigger
                value="manage"
                data-testid="tab-manage-trigger"
                className="text-xs"
              >
                Manage Library ({total}/{quotaLimit})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="generate" className="mt-4">
              <GeneratorForm
                isQuotaFull={isQuotaFull}
                isGenerating={isGenerating}
                errorMessage={errorMessage}
                onSubmit={handleGenerate}
                onSwitchToManage={() => setTabOverride("manage")}
              />
            </TabsContent>

            <TabsContent value="manage" className="mt-4">
              <CustomChallengesList
                challenges={customChallenges}
                isLoading={isLoading}
                onDelete={deleteCustomChallenge}
                onSwitchToGenerate={() => setTabOverride("generate")}
                onCloseModal={handleClose}
              />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  )
}
