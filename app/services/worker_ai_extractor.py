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


def _build_type_rules(expected_document_name: str | None) -> str:
    """Instrucciones para verificar que el documento es del TIPO esperado."""
    if not expected_document_name:
        return (
            "\n\nVERIFICACIÓN DE TIPO: no se entregó un tipo esperado; usa "
            "match_confidence='not_found' y type_reasoning=null."
        )
    return (
        f"\n\nVERIFICACIÓN DE TIPO (¿el documento es un '{expected_document_name}'?):\n"
        "• Determina match_confidence:\n"
        "    - 'match': el documento es claramente ese tipo.\n"
        "    - 'likely_match': parece ese tipo pero es ambiguo o de baja calidad.\n"
        "    - 'mismatch': es claramente OTRO tipo de documento.\n"
        "    - 'not_found': no se puede determinar el tipo.\n"
        "• type_reasoning: una frase breve explicando la decisión.\n"
        "Ejemplos:\n"
        "    - Esperado 'Certificado de antecedentes'; el documento es un certificado de "
        "antecedentes → match_confidence='match'.\n"
        "    - Esperado 'Licencia de conducir'; el documento es un contrato de trabajo "
        "→ match_confidence='mismatch'.\n"
    )


def _build_person_rules(expected_person_name: str | None) -> str:
    """Instrucciones para la verificación de titular (SOLO nombre, nunca RUT/DNI)."""
    if not expected_person_name:
        return (
            "\n\nVERIFICACIÓN DE TITULAR: no se entregó un nombre esperado. "
            "Extrae person_name_detected si el documento muestra un titular, y usa "
            "person_match='not_found'."
        )
    return (
        "\n\nVERIFICACIÓN DE TITULAR (compara SOLO el nombre; NUNCA uses RUT/DNI ni otros datos):\n"
        f"• Nombre esperado del titular: '{expected_person_name}'.\n"
        "• Pon en person_name_detected el nombre de la persona titular tal como aparece en el "
        "documento (o null si el documento no muestra un nombre de persona).\n"
        "• Determina person_match:\n"
        "    - 'match': el nombre del documento corresponde CLARAMENTE al esperado. Tolera orden "
        "invertido (apellidos antes que nombres), segundo nombre o segundo apellido ausente, "
        "tildes, mayúsculas/minúsculas y abreviaturas.\n"
        "    - 'likely_match': coincidencia parcial o ambigua (p. ej. coincide solo un apellido).\n"
        "    - 'mismatch': el documento es CLARAMENTE de OTRA persona.\n"
        "    - 'not_found': el documento no muestra un nombre de persona titular (documento "
        "genérico). En ese caso NO se alarma.\n"
        "• Los nombres chilenos suelen tener dos apellidos y el orden puede variar; sé tolerante "
        "con el formato. Reserva 'mismatch' solo para nombres claramente distintos.\n"
        "• identity_reasoning: una frase breve explicando la decisión de person_match.\n"
        "Ejemplos:\n"
        "    - Esperado 'Juan Pérez González'; el documento dice 'PÉREZ GONZÁLEZ, Juan A.' "
        "→ person_match='match'.\n"
        "    - Esperado 'María López Soto'; el documento dice 'Carlos Ramírez Díaz' "
        "→ person_match='mismatch'.\n"
    )


async def extract_dates(
    content: bytes,
    mime: str,
    filename: str,
    expected_document_name: str | None = None,
    expected_person_name: str | None = None,
) -> dict:
    """
    Calls OpenAI Vision and returns:
        issue_date              str | None   (YYYY-MM-DD)
        expiry_date             str | None   (YYYY-MM-DD)
        document_type_detected  str | None
        match_confidence        str          (veredicto de TIPO: match|likely_match|mismatch|not_found)
        type_reasoning          str | None
        person_name_detected    str | None   (nombre del titular tal como aparece)
        person_match            str          (veredicto de IDENTIDAD: match|likely_match|mismatch|not_found)
        identity_reasoning      str | None

    match_confidence y person_match SIEMPRE son uno de los 4 valores; si la IA no los
    devuelve o devuelve algo inválido, degradan a "not_found" (seguro: no alarma).
    """
    image_bytes, image_mime = await _to_image(content, mime, filename)
    b64 = base64.standard_b64encode(image_bytes).decode()

    _json_schema = (
        '{"issue_date":"2024-03-15 o null (tipo JSON, no el string null)",'
        '"expiry_date":"2025-03-15 o null (tipo JSON, no el string null)",'
        '"document_type_detected":"nombre del documento",'
        '"match_confidence":"match | likely_match | mismatch | not_found",'
        '"type_reasoning":"breve explicación del match_confidence, o null",'
        '"person_name_detected":"nombre del titular tal como aparece, o null",'
        '"person_match":"match | likely_match | mismatch | not_found",'
        '"identity_reasoning":"breve explicación del person_match, o null"}'
    )
    _rules = (
        "Reglas para encontrar la fecha de vencimiento (expiry_date):\n"
        "• Busca textos como: 'válido hasta', 'vigente hasta', 'vence el', 'caduca el', "
        "'fecha de vencimiento', 'fecha de caducidad', 'expiry date', 'valid until'.\n"
        "• Si el documento indica 'válido por X meses' o 'validez X años' a partir de la emisión, "
        "CALCULA la fecha de vencimiento sumando ese período a la issue_date.\n"
        "• Si no existe NINGUNA referencia a vencimiento ni período de vigencia, usa JSON null (no el string 'null').\n"
        "• Fechas en formato YYYY-MM-DD."
    )
    _type_rules = _build_type_rules(expected_document_name)
    _person_rules = _build_person_rules(expected_person_name)
    _doc_context = (
        f"Se espera que el documento sea: '{expected_document_name}'.\n\n"
        if expected_document_name
        else ""
    )

    system_prompt = (
        "Eres un auditor experto en documentos laborales y de acreditación de trabajadores chilenos.\n\n"
        f"{_doc_context}"
        "Extrae las fechas (issue_date, expiry_date), verifica el TIPO de documento, "
        "extrae el nombre del titular y verifica a quién pertenece el documento.\n\n"
        f"{_rules}"
        f"{_type_rules}"
        f"{_person_rules}\n\n"
        "Devuelve SOLO el JSON, sin texto adicional.\n"
        f"Responde EXCLUSIVAMENTE con este JSON:\n{_json_schema}"
    )
    _doc_hint = f" '{expected_document_name}'" if expected_document_name else ""
    user_text = (
        f"Analiza este documento{_doc_hint}. "
        "Extrae issue_date, expiry_date y el nombre del titular (person_name_detected), y "
        "determina person_match. Si indica validez por meses o años, calcula expiry_date "
        "sumando ese período a issue_date."
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
            max_tokens=400,
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

    # match_confidence/person_match SIEMPRE degradan a "not_found" si faltan o son
    # inválidos (seguro: no alarma). Lógica compartida en app/services/ai_validation.
    from app.services.ai_validation import normalize_verdict

    return {
        "issue_date": _clean(data.get("issue_date")),
        "expiry_date": _clean(data.get("expiry_date")),
        "document_type_detected": _clean(data.get("document_type_detected")),
        "match_confidence": normalize_verdict(data.get("match_confidence")),
        "type_reasoning": _clean(data.get("type_reasoning")),
        "person_name_detected": _clean(data.get("person_name_detected")),
        "person_match": normalize_verdict(data.get("person_match")),
        "identity_reasoning": _clean(data.get("identity_reasoning")),
    }
