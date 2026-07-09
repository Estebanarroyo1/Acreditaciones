'use client'

export function ArchiveWorkerConfirmDialog({
  workerName,
  onConfirm,
  onCancel,
  archiving,
}: {
  workerName: string
  onConfirm: () => void
  onCancel: () => void
  archiving: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="px-6 py-5">
          <h3 className="text-base font-bold text-slate-900 mb-2">¿Archivar trabajador?</h3>
          <p className="text-sm text-slate-600 mb-1">
            <strong>{workerName}</strong> ya no aparecerá en las vistas activas del directorio ni en el semáforo global.
          </p>
          <p className="text-sm text-slate-500">
            Sus documentos permanecen intactos para el registro histórico y podrás restaurarlo más adelante.
          </p>
        </div>
        <div className="px-6 pb-5 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 text-sm font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={archiving}
            className="flex-1 py-2.5 text-sm font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {archiving ? 'Archivando…' : 'Archivar'}
          </button>
        </div>
      </div>
    </div>
  )
}
