'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { AssignedProjectProfile } from '@/lib/types'
import { TrafficLightBadge } from '../TrafficLightBadge'
import { DownloadZipButton } from './DownloadZipButton'
import { ReqRow } from './ReqRow'

export function ProjectCard({
  project,
  workerId,
  onRefresh,
  onPreview,
}: {
  project: AssignedProjectProfile
  workerId: number
  onRefresh: () => void
  onPreview: (docId: number, label: string) => void
}) {
  const [open, setOpen] = useState(false)
  const noSpecific = project.project_specific_requirements.length === 0

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      {/* Card header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors text-left"
      >
        <TrafficLightBadge status={project.traffic_light} size="md" showLabel />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-800 truncate">{project.project_name}</p>
          {project.project_description && (
            <p className="text-xs text-slate-500 mt-0.5 truncate">{project.project_description}</p>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <DownloadZipButton workerId={workerId} scope={{ kind: 'project', projectId: project.project_id }} />
          <Link
            href={`/trabajadores/proyectos/${project.project_id}`}
            onClick={(e) => e.stopPropagation()}
            className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
          >
            Ver proyecto →
          </Link>
          <svg
            className={`w-5 h-5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded requirements */}
      {open && (
        <div className="border-t border-slate-100 px-5 py-4 bg-slate-50/50 space-y-2">
          {noSpecific ? (
            <p className="text-sm text-slate-400 text-center py-4 italic">
              Este proyecto no tiene requisitos específicos adicionales.
            </p>
          ) : (
            project.project_specific_requirements.map((req) => (
              <ReqRow
                key={req.document_type_id}
                dtId={req.document_type_id}
                dtName={req.document_type_name}
                category={req.category}
                checkStatus={req.check_status}
                expiryDate={req.expiry_date}
                daysUntilExpiry={req.days_until_expiry}
                isMandatory={req.is_mandatory}
                workerDocumentId={req.worker_document_id}
                workerId={workerId}
                projectIds={[project.project_id]}
                onRefresh={onRefresh}
                onPreview={onPreview}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}
