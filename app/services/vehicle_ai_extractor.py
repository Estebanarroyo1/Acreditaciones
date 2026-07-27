import base64
import json

from openai import AsyncOpenAI, BadRequestError

from app.core.config import settings

# Cliente único a nivel de módulo (creado una sola vez, de forma perezosa para
# no fallar al importar cuando OPENAI_API_KEY está vacío). timeout=30s y
# max_retries=1 evitan que una llamada colgada bloquee el request indefinidamente.
_client: AsyncOpenAI | None = None


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(
            api_key=settings.OPENAI_API_KEY,
            timeout=30.0,
            max_retries=1,
        )
    return _client


async def _to_image(content: bytes, mime: str, filename: str) -> tuple[bytes, str]:
    """Convert PDF to PNG or validate image MIME. Returns (content, mime)."""
    fn = filename.lower()

    if "pdf" in mime or fn.endswith(".pdf"):
        try:
            import fitz
            pdf = fitz.open(stream=content, filetype="pdf")
            pix = pdf[0].get_pixmap(matrix=fitz.Matrix(2, 2))
            return pix.tobytes("png"), "image/png"
        except Exception as exc:
            raise ValueError("No se pudo procesar el PDF.") from exc

    valid = {"image/jpeg", "image/png", "image/gif", "image/webp"}
    if mime not in valid:
        if fn.endswith((".jpg", ".jpeg")):
            mime = "image/jpeg"
        elif fn.endswith(".png"):
            mime = "image/png"
        elif fn.endswith(".gif"):
            mime = "image/gif"
        elif fn.endswith(".webp"):
            mime = "image/webp"
        else:
            raise ValueError("Formato no compatible. Sube una imagen (JPG, PNG) o un PDF.")

    return content, mime


async def extract_and_validate(
    content: bytes,
    mime: str,
    filename: str,
    expected_document_name: str | None = None,
) -> dict:
    """
    Calls OpenAI vision and returns:
        issue_date              str | None   (YYYY-MM-DD)
        expiry_date             str | None   (YYYY-MM-DD)
        document_type_detected  str | None
        is_expected_document    bool         (always True when expected_document_name is None)
        detected_document_name  str | None   (populated when is_expected_document is False)
    """
    image_bytes, image_mime = await _to_image(content, mime, filename)
    b64 = base64.standard_b64encode(image_bytes).decode()

    if expected_document_name:
        system_prompt = (
            f"Eres un auditor experto en documentos vehiculares chilenos. "
            f"Se espera que el documento sea: '{expected_document_name}'.\n"
            f"Debes:\n"
            f"1. Verificar si el documento corresponde a '{expected_document_name}'.\n"
            f"2. Extraer fecha de emisión y fecha de vencimiento.\n"
            f"Responde EXCLUSIVAMENTE con este JSON (sin texto extra):\n"
            f'{{"issue_date":"YYYY-MM-DD o null",'
            f'"expiry_date":"YYYY-MM-DD o null",'
            f'"document_type_detected":"nombre del documento detectado",'
            f'"is_expected_document":true,'
            f'"detected_document_name":null}}\n'
            f"Si el documento NO corresponde a '{expected_document_name}', "
            f"cambia is_expected_document a false y detected_document_name al nombre real."
        )
        user_text = f"¿Este documento es un '{expected_document_name}'? Extrae las fechas y verifica."
    else:
        system_prompt = (
            "Eres un auditor experto en documentos vehiculares chilenos. "
            "Extrae la información del documento y responde EXCLUSIVAMENTE con este JSON:\n"
            '{"issue_date":"YYYY-MM-DD o null",'
            '"expiry_date":"YYYY-MM-DD o null",'
            '"document_type_detected":"nombre del tipo de documento",'
            '"is_expected_document":true,'
            '"detected_document_name":null}'
        )
        user_text = "Analiza este documento y extrae las fechas y el tipo de documento."

    client = _get_client()
    try:
        response = await client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:{image_mime};base64,{b64}"},
                        },
                        {"type": "text", "text": user_text},
                    ],
                },
            ],
            response_format={"type": "json_object"},
            max_tokens=400,
        )
    except BadRequestError as exc:
        raise ValueError(f"OpenAI rechazó el archivo: {exc.message}") from exc

    raw = response.choices[0].message.content or "{}"
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        data = {}

    return {
        "issue_date": data.get("issue_date") or None,
        "expiry_date": data.get("expiry_date") or None,
        "document_type_detected": data.get("document_type_detected") or None,
        "is_expected_document": bool(data.get("is_expected_document", True)),
        "detected_document_name": data.get("detected_document_name") or None,
    }
