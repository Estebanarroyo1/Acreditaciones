'use client'

import type { DocumentType } from '@/lib/types'
import { usePermissions } from '@/lib/permissions'

export function DocTypeRow({
  docType,
  onToggle,
  onEdit,
  onDelete,
  showAchsBadge = false,
}: {
  docType: DocumentType
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  showAchsBadge?: boolean
}) {
  const { canWrite } = usePermissions()
  return (
    <div className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <span className={`w-2 h-2 rounded-full shrink-0 ${docType.is_global_base_requirement ? 'bg-blue-500' : 'bg-slate-300'}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-slate-800 truncate">{docType.name}</p>
            <span
              title={docType.ai_validation_enabled ? 'Validación con IA activa' : 'Revisión manual (sin IA)'}
              className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${
                docType.ai_validation_enabled
                  ? 'bg-blue-50 text-blue-600 border border-blue-200'
                  : 'bg-slate-100 text-slate-500 border border-slate-200'
              }`}
            >
              {docType.ai_validation_enabled ? 'IA' : 'Manual'}
            </span>
            {showAchsBadge && docType.achs_category && (
              <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${
                docType.achs_category === 'EXAMEN'
                  ? 'bg-orange-100 text-orange-700 border border-orange-200'
                  : 'bg-sky-100 text-sky-700 border border-sky-200'
              }`}>
                {docType.achs_category}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {docType.category?.name ?? 'Sin categoría'}
            {docType.validity_days
              ? ` · ${docType.validity_days}d de vigencia`
              : ' · Sin vencimiento'}
            {docType.alert_percentage_override != null
              ? ` · alerta al ${docType.alert_percentage_override}%`
              : ''}
          </p>
        </div>
      </div>
      {canWrite('configuracion') && (
        <div className="flex items-center gap-1.5 shrink-0 ml-4">
          <button
            onClick={onToggle}
            className={`text-xs font-semibold px-2.5 py-1.5 rounded-sm transition-colors ${
              docType.is_global_base_requirement
                ? 'bg-blue-100 text-blue-700 hover:bg-red-50 hover:text-red-600'
                : 'bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-700'
            }`}
            title={docType.is_global_base_requirement ? 'Quitar de requisitos globales' : 'Promover a requisito global'}
          >
            {docType.is_global_base_requirement ? '● Global' : 'Hacer global'}
          </button>
          <button
            onClick={onEdit}
            title="Editar tipo de documento"
            className="p-1.5 rounded-sm text-slate-400 hover:text-[#003f7a] hover:bg-[#e6f0f9] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
            </svg>
          </button>
          <button
            onClick={onDelete}
            title="Eliminar tipo de documento"
            className="p-1.5 rounded-sm text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
