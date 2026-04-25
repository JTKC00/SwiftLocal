from fastapi import APIRouter, HTTPException
from pydantic import BaseModel


router = APIRouter(tags=["text"])

_ALLOWED_LOCALES = frozenset({"zh-hans", "zh-hant", "zh-cn", "zh-tw", "zh-hk", "zh-my", "zh-sg"})
_MAX_TEXT_LEN = 500_000


class TextConvertPayload(BaseModel):
    text: str
    locale: str


@router.post("/convert-text")
async def convert_text(payload: TextConvertPayload):
    if len(payload.text) > _MAX_TEXT_LEN:
        raise HTTPException(
            status_code=400,
            detail=f"文字過長，每次最多 {_MAX_TEXT_LEN:,} 字元",
        )
    if payload.locale not in _ALLOWED_LOCALES:
        raise HTTPException(
            status_code=400,
            detail=f"不支援的 locale：{payload.locale}。支援：{sorted(_ALLOWED_LOCALES)}",
        )
    try:
        import zhconv  # lazy import
        result = zhconv.convert(payload.text, payload.locale)
        return {"result": result}
    except ImportError as error:
        raise HTTPException(
            status_code=500,
            detail="zhconv 未安裝，請執行 pip install zhconv",
        ) from error
