'use client'

import { useRef, useState } from 'react'
import type { WorkerAIScanResult } from '@/lib/types'
import { api } from '@/lib/api'
import { getExpiryStatus } from './utils'

interface Options {
  validityDays?: number | null
  initialExpiryDate?: string
}

export function useDocumentAIScan({ validityDays, initialExpiryDate = '' }: Options = {}) {
  const [file, setFile] = useState<File | null>(null)
  const [issueDate, setIssueDate] = useState('')
  const [expiryDate, setExpiryDate] = useState(initialExpiryDate)
  const [scanning, setScanning] = useState(false)
  const [aiResult, setAiResult] = useState<WorkerAIScanResult | null>(null)
  const [scanNoResults, setScanNoResults] = useState(false)
  const [error, setError] = useState('')
  const [blockedError, setBlockedError] = useState('')
  const [expiryWarning, setExpiryWarning] = useState('')
  const [suggestedExpiry, setSuggestedExpiry] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const checkExpiryStatus = (expiry: string) => {
    const st = getExpiryStatus(expiry)
    setBlockedError(st.type === 'blocked' ? st.msg : '')
    setExpiryWarning(st.type === 'warning' ? st.msg : '')
  }

  const acceptSuggestion = () => {
    if (!suggestedExpiry) return
    setExpiryDate(suggestedExpiry)
    checkExpiryStatus(suggestedExpiry)
    setSuggestedExpiry(null)
  }

  const handleAiScan = async () => {
    if (!file) return
    setScanning(true)
    setError('')
    setBlockedError('')
    setExpiryWarning('')
    setSuggestedExpiry(null)
    setScanNoResults(false)
    try {
      const result = await api.scanWorkerDocument(file, validityDays)
      setAiResult(result)
      const foundAny = !!(result.issue_date || result.expiry_date)
      setScanNoResults(!foundAny)
      if (result.issue_date) setIssueDate(result.issue_date)
      if (result.expiry_date) {
        if (result.expiry_computed) {
          setSuggestedExpiry(result.expiry_date)
        } else {
          setExpiryDate(result.expiry_date)
          checkExpiryStatus(result.expiry_date)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al analizar con IA')
    } finally {
      setScanning(false)
    }
  }

  return {
    file, setFile,
    issueDate, setIssueDate,
    expiryDate, setExpiryDate,
    scanning,
    aiResult, setAiResult,
    scanNoResults, setScanNoResults,
    error, setError,
    blockedError, setBlockedError,
    expiryWarning, setExpiryWarning,
    suggestedExpiry, setSuggestedExpiry,
    inputRef,
    checkExpiryStatus,
    acceptSuggestion,
    handleAiScan,
  }
}
