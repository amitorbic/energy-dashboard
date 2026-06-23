import os
import re


def get_tenant_email(purpose: str) -> str:
    addr = (
        os.getenv(f"TENANT_EMAIL_{purpose.upper()}")
        or os.getenv("TENANT_EMAIL_DEFAULT")
    )
    if not addr:
        raise RuntimeError(
            f"No email configured for purpose '{purpose}' and TENANT_EMAIL_DEFAULT is not set. "
            f"Set TENANT_EMAIL_{purpose.upper()} or TENANT_EMAIL_DEFAULT in .env"
        )
    return addr


def get_tenant_display_name() -> str:
    """Customer-facing brand name. Separate from TENANT_COMPANY_NAME (internal/SMTP From)."""
    return (
        os.getenv("TENANT_DISPLAY_NAME")
        or os.getenv("TENANT_COMPANY_NAME")
        or "AmeriPower"
    )


def get_tenant_website() -> str:
    return os.getenv("TENANT_WEBSITE", "www.ameripower.com")


def get_tenant_address() -> str:
    return os.getenv("TENANT_ADDRESS", "")


def get_tenant_phone() -> str:
    return os.getenv("TENANT_PHONE", "")


def filename_safe(name: str) -> str:
    """Strips characters invalid or awkward in filenames."""
    return re.sub(r"[^A-Za-z0-9_-]+", "_", name).strip("_")
