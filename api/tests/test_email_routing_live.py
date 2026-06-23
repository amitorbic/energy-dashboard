"""
End-to-end email routing smoke test.
Patches smtplib.SMTP_SSL so nothing actually sends.
Run from api/ directory: python -m pytest tests/test_email_routing_live.py -v
"""
import os
import sys
import email as email_lib
import smtplib
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

os.environ.setdefault("SMTP_HOST", "smtp.hostinger.com")
os.environ.setdefault("SMTP_PORT", "465")
os.environ.setdefault("SMTP_USER", "info@enertsol.com")
os.environ.setdefault("SMTP_PASS", "dummy-for-test")


# ── helpers ───────────────────────────────────────────────────────────────────

class _FakeSMTP:
    def __init__(self, *a, **kw):
        self.calls = {}
    def __enter__(self): return self
    def __exit__(self, *a): pass
    def login(self, *a): pass
    def sendmail(self, from_addr, to_addrs, msg_string):
        self.calls['envelope_from'] = from_addr
        self.calls['to'] = to_addrs
        self.calls['raw'] = msg_string


def _send_and_capture(purpose, to="broker@example.com"):
    fake = _FakeSMTP()
    with patch("smtplib.SMTP_SSL", return_value=fake):
        from utils.email import send_email
        send_email(to=to, subject="Test", html="<p>hi</p>", purpose=purpose)
    return fake.calls


# ── tests ─────────────────────────────────────────────────────────────────────

def test_get_tenant_email_falls_back_to_default():
    os.environ.pop("TENANT_EMAIL_COMMISSION", None)
    os.environ["TENANT_EMAIL_DEFAULT"] = "info@enertsol.com"
    from utils.email_routing import get_tenant_email
    assert get_tenant_email("commission") == "info@enertsol.com"
    assert get_tenant_email("operations") == "info@enertsol.com"
    assert get_tenant_email("pricing") == "info@enertsol.com"


def test_get_tenant_email_purpose_key_overrides_default():
    os.environ["TENANT_EMAIL_DEFAULT"] = "info@enertsol.com"
    os.environ["TENANT_EMAIL_COMMISSION"] = "commission@enertsol.com"
    from utils.email_routing import get_tenant_email
    assert get_tenant_email("commission") == "commission@enertsol.com"
    assert get_tenant_email("operations") == "info@enertsol.com"
    del os.environ["TENANT_EMAIL_COMMISSION"]


def test_get_tenant_email_raises_when_no_default():
    os.environ.pop("TENANT_EMAIL_DEFAULT", None)
    os.environ.pop("TENANT_EMAIL_PRICING", None)
    from utils.email_routing import get_tenant_email
    try:
        get_tenant_email("pricing")
        raise AssertionError("Should have raised RuntimeError")
    except RuntimeError as e:
        assert "TENANT_EMAIL_DEFAULT" in str(e)
        assert "pricing" in str(e).lower()
    finally:
        os.environ["TENANT_EMAIL_DEFAULT"] = "info@enertsol.com"


def test_send_email_envelope_uses_bare_address():
    os.environ["TENANT_EMAIL_DEFAULT"] = "info@enertsol.com"
    os.environ["TENANT_COMPANY_NAME"] = "AmeriPower (ORBIC)"
    calls = _send_and_capture("commission")
    assert calls["envelope_from"] == "info@enertsol.com", \
        f"Envelope from_addr must be bare address, got: {calls['envelope_from']!r}"
    assert "ameripower.com" not in calls["envelope_from"].lower()


def test_send_email_from_header_includes_display_name():
    os.environ["TENANT_EMAIL_DEFAULT"] = "info@enertsol.com"
    os.environ["TENANT_COMPANY_NAME"] = "AmeriPower (ORBIC)"
    calls = _send_and_capture("commission")
    msg = email_lib.message_from_string(calls["raw"])
    assert msg["From"] == "AmeriPower (ORBIC) <info@enertsol.com>", \
        f"From header wrong: {msg['From']!r}"
    assert "ameripower.com" not in msg["From"].lower(), \
        f"ameripower.com leaked into From header: {msg['From']!r}"


def test_send_email_no_display_name_uses_bare_address():
    os.environ["TENANT_EMAIL_DEFAULT"] = "info@enertsol.com"
    os.environ.pop("TENANT_COMPANY_NAME", None)
    calls = _send_and_capture("operations")
    msg = email_lib.message_from_string(calls["raw"])
    assert msg["From"] == "info@enertsol.com", \
        f"From header with no display name wrong: {msg['From']!r}"
    os.environ["TENANT_COMPANY_NAME"] = "AmeriPower (ORBIC)"
