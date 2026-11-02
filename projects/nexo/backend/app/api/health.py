from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: Literal["ok"]
    service: Literal["nexo-api"]
    version: str


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:

    return HealthResponse(status="ok", service="nexo-api", version="0.1.0")
