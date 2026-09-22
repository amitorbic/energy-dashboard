"""
TENANT_MODULES config parsing tests.

docs/ORBIC_PRODUCT_MODULARIZATION_SCOPE.md section 15: entitlements for this
phase are read from the TENANT_MODULES env var (utils/tenant_module_config.py),
not from the master DB. These tests cover the fail-open rules the rest of the
app depends on -- a misconfigured or absent value must never lock a tenant
out of a module.

Run from api/:
    pytest tests/test_tenant_module_config.py -v
"""

import os
from unittest.mock import patch

from utils.tenant_modules import ALL_MODULES
from utils.tenant_module_config import get_configured_modules


def test_missing_env_enables_all_modules():
    env = {k: v for k, v in os.environ.items() if k != "TENANT_MODULES"}
    with patch.dict(os.environ, env, clear=True):
        assert sorted(get_configured_modules()) == sorted(ALL_MODULES)


def test_empty_env_enables_all_modules():
    with patch.dict(os.environ, {"TENANT_MODULES": ""}):
        assert sorted(get_configured_modules()) == sorted(ALL_MODULES)


def test_enterprise_enables_all_modules():
    with patch.dict(os.environ, {"TENANT_MODULES": "enterprise"}):
        assert sorted(get_configured_modules()) == sorted(ALL_MODULES)


def test_enterprise_mixed_with_others_enables_all_modules():
    with patch.dict(os.environ, {"TENANT_MODULES": "sales,enterprise"}):
        assert sorted(get_configured_modules()) == sorted(ALL_MODULES)


def test_all_four_explicit_enables_all_modules():
    with patch.dict(os.environ, {"TENANT_MODULES": "sales,operations,portfolio,audit"}):
        assert sorted(get_configured_modules()) == sorted(ALL_MODULES)


def test_restricted_config_enables_only_listed_modules():
    with patch.dict(os.environ, {"TENANT_MODULES": "sales"}):
        assert get_configured_modules() == ["sales"]


def test_restricted_config_is_case_insensitive_and_trims_whitespace():
    with patch.dict(os.environ, {"TENANT_MODULES": " Sales , Portfolio "}):
        assert sorted(get_configured_modules()) == ["portfolio", "sales"]


def test_unknown_module_names_are_ignored():
    with patch.dict(os.environ, {"TENANT_MODULES": "sales,bogus"}):
        assert get_configured_modules() == ["sales"]


def test_all_unknown_module_names_fails_open_to_all_modules():
    with patch.dict(os.environ, {"TENANT_MODULES": "bogus,nonsense"}):
        assert sorted(get_configured_modules()) == sorted(ALL_MODULES)
