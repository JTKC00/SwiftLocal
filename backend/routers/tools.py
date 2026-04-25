from pydantic import BaseModel
from fastapi import APIRouter, HTTPException

from ..services.tools_service import tools_service


router = APIRouter(tags=["tools"])


class ToolPathPayload(BaseModel):
    path: str = ""


@router.get("/tools")
async def get_tools():
    return await tools_service.detect_tools()


@router.put("/tools/{key}")
async def set_tool_path(key: str, payload: ToolPathPayload):
    try:
        return await tools_service.set_tool_path(key, payload.path)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.delete("/tools/{key}")
async def clear_tool_path(key: str):
    try:
        return await tools_service.set_tool_path(key, "")
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
