"""
Auditoría de archivos ya subidos (solo lectura — NUNCA borra nada).

Recorre UPLOAD_DIR, valida la firma binaria (magic bytes) de cada archivo
existente contra su extensión declarada y reporta los sospechosos (extensión
no permitida o firma que no coincide con la extensión).

Uso (desde C:\\Acreditaciones con el .venv activo):
    .venv\\Scripts\\python.exe -m scripts.audit_uploads
"""
import sys
from pathlib import Path

from fastapi import HTTPException

from app.core.config import settings
from app.services.storage import validate_upload


def main() -> int:
    root = Path(settings.UPLOAD_DIR)
    if not root.exists():
        print(f"UPLOAD_DIR no existe: {root.resolve()}")
        return 0

    total = 0
    suspicious: list[tuple[Path, str]] = []

    for path in root.rglob("*"):
        if not path.is_file():
            continue
        total += 1
        # El nombre en disco es "<uuidhex>_<nombre_original>"; su sufijo
        # conserva la extensión original, así que validamos sobre path.name.
        try:
            content = path.read_bytes()
            validate_upload(content, path.name)
        except HTTPException as exc:
            suspicious.append((path, str(exc.detail)))
        except OSError as exc:
            suspicious.append((path, f"No se pudo leer el archivo: {exc}"))

    print(f"Archivos escaneados: {total}")
    print(f"Sospechosos: {len(suspicious)}")
    for p, reason in suspicious:
        print(f"  [!] {p}  ->  {reason}")

    # Exit code 1 si hay sospechosos (útil para CI); no se borra nada.
    return 1 if suspicious else 0


if __name__ == "__main__":
    sys.exit(main())
