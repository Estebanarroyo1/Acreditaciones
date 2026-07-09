"""
Async email service using aiosmtplib.
Builds HTML messages from a single embedded template — no external files needed.
"""
import logging
from dataclasses import dataclass
from datetime import date, datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import aiosmtplib

from app.core.config import settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data transfer objects used by the job
# ---------------------------------------------------------------------------

@dataclass
class DocumentAlert:
    doc_name: str
    category: str
    expiry_date: date
    threshold_days: int


# ---------------------------------------------------------------------------
# HTML template helpers
# ---------------------------------------------------------------------------

_THRESHOLD_BADGE: dict[int, tuple[str, str]] = {
    0:  ("#dc2626", "VENCE HOY"),
    7:  ("#dc2626", "7 días"),
    15: ("#d97706", "15 días"),
    30: ("#ca8a04", "30 días"),
    60: ("#2563eb", "60 días"),
}


def _doc_row(alert: DocumentAlert) -> str:
    color, label = _THRESHOLD_BADGE.get(
        alert.threshold_days, ("#6b7280", f"{alert.threshold_days}d")
    )
    return f"""
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #eee;">{alert.doc_name}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #eee;color:#555;">{alert.category}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:center;">
              {alert.expiry_date.strftime('%d/%m/%Y')}
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:center;">
            <span style="background:{color};color:#fff;padding:3px 10px;
                         border-radius:12px;font-size:12px;font-weight:bold;">
              {label}
            </span>
          </td>
        </tr>"""


def build_html(worker_name: str, project_name: str, alerts: list[DocumentAlert]) -> str:
    rows = "".join(_doc_row(a) for a in alerts)
    today_str = datetime.now(timezone.utc).strftime("%d/%m/%Y")
    return f"""<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:20px;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:620px;margin:0 auto;background:#fff;border-radius:8px;
              overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.12);">

    <!-- Header -->
    <div style="background:#1a3c5e;padding:28px 32px;">
      <p style="margin:0;font-size:11px;color:#94b4d1;letter-spacing:1px;text-transform:uppercase;">
        Plataforma de Acreditaciones
      </p>
      <h1 style="margin:6px 0 0;font-size:20px;color:#fff;">
        &#9888; Alerta de Documentos por Vencer
      </h1>
    </div>

    <!-- Body -->
    <div style="padding:28px 32px;">
      <p style="margin:0 0 6px;">Estimado/a <strong>{worker_name}</strong>,</p>
      <p style="margin:0 0 20px;color:#444;">
        Los siguientes documentos del proyecto
        <strong>{project_name}</strong> requieren su atención:
      </p>

      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr style="background:#f0f4f8;">
            <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #dde3ea;
                       font-weight:600;color:#374151;">Documento</th>
            <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #dde3ea;
                       font-weight:600;color:#374151;">Categoría</th>
            <th style="padding:10px 12px;text-align:center;border-bottom:2px solid #dde3ea;
                       font-weight:600;color:#374151;">Vence</th>
            <th style="padding:10px 12px;text-align:center;border-bottom:2px solid #dde3ea;
                       font-weight:600;color:#374151;">Alerta</th>
          </tr>
        </thead>
        <tbody>{rows}
        </tbody>
      </table>

      <p style="margin:20px 0 0;padding:16px;background:#fef9ec;border-left:4px solid #f59e0b;
                color:#78350f;font-size:13px;border-radius:0 4px 4px 0;">
        Por favor actualice su documentación para mantener su acreditación vigente.
      </p>
    </div>

    <!-- Footer -->
    <div style="background:#f0f4f8;padding:16px 32px;font-size:12px;color:#6b7280;">
      Mensaje automático generado el {today_str}. No responda a este correo.
    </div>
  </div>
</body>
</html>"""


# ---------------------------------------------------------------------------
# Send function
# ---------------------------------------------------------------------------

async def send_alert_email(
    to_email: str,
    worker_name: str,
    project_name: str,
    alerts: list[DocumentAlert],
) -> None:
    """
    Sends one consolidated HTML alert email.
    Raises on SMTP failure so the caller can decide whether to log/retry.
    """
    if not settings.SMTP_USER:
        logger.warning(
            "SMTP_USER not configured — skipping email to %s", to_email
        )
        return

    subject_parts = []
    if any(a.threshold_days == 0 for a in alerts):
        subject_parts.append("vencen HOY")
    expiring = [a for a in alerts if a.threshold_days > 0]
    if expiring:
        min_days = min(a.threshold_days for a in expiring)
        subject_parts.append(f"{min_days} días para vencer")
    subject_hint = " | ".join(subject_parts) if subject_parts else "requieren atención"

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"[Acreditaciones] {project_name} — Documentos {subject_hint}"
    msg["From"] = settings.SMTP_FROM or settings.SMTP_USER
    msg["To"] = to_email

    html_body = build_html(worker_name, project_name, alerts)
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    await aiosmtplib.send(
        msg,
        hostname=settings.SMTP_HOST,
        port=settings.SMTP_PORT,
        username=settings.SMTP_USER,
        password=settings.SMTP_PASSWORD,
        start_tls=settings.SMTP_TLS,
    )
    logger.info("Alert sent → %s (%d docs)", to_email, len(alerts))
