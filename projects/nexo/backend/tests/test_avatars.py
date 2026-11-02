from unittest.mock import patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.account import AccountStore, AccountUser, AvatarUpdate
from app.catalog import Catalog
from app.core.config import Settings


def store() -> AccountStore:
    config = Settings(
        _env_file=None,
        catalog_source="local",
        supabase_url="https://test.supabase.co",
        supabase_publishable_key="sb_publishable_test",
    )
    return AccountStore(config, Catalog(config))


def test_avatar_path_must_belong_to_the_verified_owner() -> None:
    account = store()
    with patch.object(account, "request") as request, pytest.raises(HTTPException) as error:
        account.update_avatar(
            AccountUser(id=uuid4()), "token", AvatarUpdate(avatar_path=f"{uuid4()}/{uuid4()}.webp")
        )
    assert error.value.status_code == 422
    request.assert_not_called()


def test_signed_avatar_uses_the_request_role_and_short_expiry() -> None:
    account = store()
    path = f"{uuid4()}/{uuid4()}.webp"
    with patch.object(
        account,
        "request",
        return_value=({"signedURL": f"/object/sign/avatars/{path}?token=opaque"}, None),
    ) as request:
        url = account.avatar_url(path, None)
    assert url == f"https://test.supabase.co/storage/v1/object/sign/avatars/{path}?token=opaque"
    assert request.call_args.args[1] is None
    assert request.call_args.args[3] == {"expiresIn": 120}


def test_missing_or_unavailable_avatars_fall_back_without_breaking_the_profile() -> None:
    account = store()
    with patch.object(account, "request", side_effect=HTTPException(503, "unavailable")):
        assert account.avatar_url(f"{uuid4()}/{uuid4()}.webp", "token") is None
        assert account.avatar_url(None, "token") is None
