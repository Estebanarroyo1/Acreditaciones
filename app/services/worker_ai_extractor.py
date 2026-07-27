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


async def extract_dates(
    content: bytes,
    mime: str,
    filename: str,
    expected_document_name: str | None = None,
) -> dict:
    """
    Calls OpenAI Vision and returns:
        issue_date              str | None   (YYYY-MM-DD)
        expiry_date             str | None   (YYYY-MM-DD)
        document_type_detected  str | None
    """
    image_bytes, image_mime = await _to_image(content, mime, filename)
    b64 = base64.standard_b64encode(image_bytes).decode()

    _json_schema = (
        '{"issue_date":"2024-03-15 o null (tipo JSON, no el string null)",'
        '"expiry_date":"2025-03-15 o null (tipo JSON, no el string null)",'
        '"document_type_detected":"nombre del documento"}'
    )
    _rules = (
        "Reglas para encontrar la fecha de vencimiento (expiry_date):\n"
        "• Busca textos como: 'válido hasta', 'vigente hasta', 'vence el', 'caduca el', "
        "'fecha de vencimiento', 'fecha de caducidad', 'expiry date', 'valid until'.\n"
        "• Si el documento indica 'válido por X meses' o 'validez X años' a partir de la emisión, "
        "CALCULA la fecha de vencimiento sumando ese período a la issue_date.\n"
        "• Si no existe NINGUNA referencia a vencimiento ni período de vigencia, usa JSON null (no el string 'null').\n"
        "• Devuelve SOLO el JSON, sin texto adicional. Fechas en formato YYYY-MM-DD."
    )

    if expected_document_name:
        system_prompt = (
            f"Eres un auditor experto en documentos laborales y de acreditación de trabajadores chilenos. "
            f"Se espera que el documento sea: '{expected_document_name}'.\n\n"
            f"Extrae la fecha de emisión (issue_date) y la fecha de vencimiento (expiry_date).\n\n"
            f"{_rules}\n\n"
            f"Responde EXCLUSIVAMENTE con este JSON:\n{_json_schema}"
        )
        user_text = (
            f"Analiza este documento '{expected_document_name}'. "
            f"Extrae issue_date y expiry_date. "
            f"Si indica validez por meses o años, calcula expiry_date sumando ese período a issue_date."
        )
    else:
        system_prompt = (
            "Eres un auditor experto en documentos laborales y de acreditación de trabajadores chilenos.\n\n"
            "Extrae la fecha de emisión (issue_date) y la fecha de vencimiento (expiry_date).\n\n"
            f"{_rules}\n\n"
            f"Responde EXCLUSIVAMENTE con este JSON:\n{_json_schema}"
        )
        user_text = (
            "Analiza este documento laboral. "
            "Extrae issue_date y expiry_date. "
            "Si indica validez por meses o años, calcula expiry_date sumando ese período a issue_date."
        )

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
            max_tokens=300,
        )
    except BadRequestError as exc:
        raise ValueError(f"OpenAI rechazó el archivo: {exc.message}") from exc

    raw = response.choices[0].message.content or "{}"
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        data = {}

    _null_vals = {None, "null", "NULL", "Null", ""}

    def _clean(v):
        return None if v in _null_vals else v

    return {
        "issue_date": _clean(data.get("issue_date")),
        "expiry_date": _clean(data.get("expiry_date")),
        "document_type_detected": _clean(data.get("document_type_detected")),
    }
