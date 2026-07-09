'use client'

import { useCallback, useRef, useState } from 'react'
import type { BulkUploadResult } from '@/lib/types'
import { api } from '@/lib/api'

type Step = 'idle' | 'uploading' | 'done'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export function BulkUploadModal({ isOpen, onClose, onSuccess }: Props) {
  const [step, setStep] = useState<Step>('idle')
  const [dragOver, setDragOver] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [result, setResult] = useState<BulkUploadResult | null>(null)
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setStep('idle')
    setDragOver(false)
    setSelectedFile(null)
    setResult(null)
    setUploadError('')
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleFile = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      setUploadError('Solo se aceptan archivos .xlsx')
      return
    }
    setUploadError('')
    setSelectedFile(file)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [handleFile],
  )

  const handleSubmit = async () => {
    if (!selectedFile) return
    setStep('uploading')
    setUploadError('')
    try {
      const res = await api.bulkUploadWorkers(selectedFile)
      setResult(res)
      setStep('done')
      if (res.created > 0) onSuccess()
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Error al procesar el archivo')
      setStep('idle')
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden">
        {/* Header */}
        <div className="bg-slate-900 px-6 py-5 flex items-center justify-between">
          <div>
            <h2 className="text-white font-bold text-lg">Carga Masiva de Trabajadores</h2>
            <p className="text-slate-400 text-xs mt-0.5">Importa personal desde un archivo Excel</p>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {step !== 'done' ? (
            <>
              {/* Step 1 — Download template */}
              <div className="flex items-start gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center text-sm font-bold">
                  1
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800">Descarga la plantilla oficial</p>
                  <p className="text-xs text-slate-500 mt-0.5 mb-3">
                    Completa el Excel con los datos del personal. La fila 2 es una guía — puedes eliminarla.
                  </p>
                  <a
                    href={api.getBulkTemplate()}
                    download="plantilla_trabajadores.xlsx"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-colors shadow-sm"
                  >
                    <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                    Descargar Plantilla Excel
                  </a>
                </div>
              </div>

              {/* Step 2 — Upload */}
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold">
                  2
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 mb-3">Sube el archivo completado</p>

                  {/* Drop zone */}
                  <div
                    onDrop={handleDrop}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                    onDragLeave={() => setDragOver(false)}
                    onClick={() => fileInputRef.current?.click()}
                    className={`relative flex flex-col items-center justify-center gap-2 p-8 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
                      dragOver
                        ? 'border-blue-500 bg-blue-50'
                        : selectedFile
                        ? 'border-green-400 bg-green-50'
                        : 'border-slate-300 bg-slate-50 hover:border-blue-400 hover:bg-blue-50/30'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                    />

                    {selectedFile ? (
                      <>
                        <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-sm font-semibold text-slate-800 text-center">{selectedFile.name}</p>
                        <p className="text-xs text-slate-500">
                          {(selectedFile.size / 1024).toFixed(1)} KB — clic para cambiar
                        </p>
                      </>
                    ) : (
                      <>
                        <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                        </svg>
                        <p className="text-sm font-semibold text-slate-700">
                          Arrastra el archivo aquí o haz clic para seleccionar
                        </p>
                        <p className="text-xs text-slate-400">Solo archivos .xlsx</p>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {uploadError && (
                <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                  {uploadError}
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-5 py-2.5 text-sm font-medium rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!selectedFile || step === 'uploading'}
                  className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {step === 'uploading' && (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  )}
                  {step === 'uploading' ? 'Procesando…' : 'Importar Trabajadores'}
                </button>
              </div>
            </>
          ) : (
            /* ── Results screen ────────────────────────────────────────── */
            result && <ResultScreen result={result} onClose={handleClose} onRetry={reset} />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Result screen ──────────────────────────────────────────────────────────
function ResultScreen({
  result,
  onClose,
  onRetry,
}: {
  result: BulkUploadResult
  onClose: () => void
  onRetry: () => void
}) {
  const allOk = result.errors.length === 0
  const hasPartial = result.created > 0 && result.errors.length > 0

  return (
    <div className="space-y-5">
      {/* Summary banner */}
      <div className={`flex items-center gap-4 p-4 rounded-xl border ${
        allOk
          ? 'bg-green-50 border-green-200'
          : hasPartial
          ? 'bg-amber-50 border-amber-200'
          : 'bg-red-50 border-red-200'
      }`}>
        {allOk ? (
          <svg className="w-8 h-8 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ) : hasPartial ? (
          <svg className="w-8 h-8 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
          </svg>
        ) : (
          <svg className="w-8 h-8 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}
        <div>
          <p className={`text-sm font-bold ${allOk ? 'text-green-800' : hasPartial ? 'text-amber-800' : 'text-red-800'}`}>
            {allOk
              ? `¡Importación exitosa! ${result.created} trabajador${result.created !== 1 ? 'es' : ''} creado${result.created !== 1 ? 's' : ''}.`
              : hasPartial
              ? `Importación parcial: ${result.created} creado${result.created !== 1 ? 's' : ''}, ${result.errors.length} error${result.errors.length !== 1 ? 'es' : ''}.`
              : `No se pudo importar ningún trabajador.`}
          </p>
          <p className={`text-xs mt-0.5 ${allOk ? 'text-green-600' : hasPartial ? 'text-amber-600' : 'text-red-600'}`}>
            Procesados: {result.total_processed} · Creados: {result.created} · Errores: {result.errors.length}
          </p>
        </div>
      </div>

      {/* Error table */}
      {result.errors.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Filas con errores ({result.errors.length}) — corrige y vuelve a intentar
          </p>
          <div className="rounded-xl border border-red-100 overflow-hidden max-h-56 overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-red-50 text-slate-600 font-semibold uppercase tracking-wide">
                  <th className="px-3 py-2 text-left w-14">Fila</th>
                  <th className="px-3 py-2 text-left w-32">RUT/DNI</th>
                  <th className="px-3 py-2 text-left">Motivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-red-50 bg-white">
                {result.errors.map((err, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 font-mono text-slate-500">{err.row > 0 ? err.row : '—'}</td>
                    <td className="px-3 py-2 font-mono text-slate-700">{err.dni ?? '—'}</td>
                    <td className="px-3 py-2 text-slate-600">{err.error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-1">
        {result.errors.length > 0 && (
          <button
            type="button"
            onClick={onRetry}
            className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
          >
            Intentar otra vez
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-700 transition-colors"
        >
          {result.errors.length === 0 ? 'Listo' : 'Cerrar'}
        </button>
      </div>
    </div>
  )
}
