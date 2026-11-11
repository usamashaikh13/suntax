from types import SimpleNamespace
import urllib.request

from sqlalchemy import create_engine
import pyotp
import pytest

from app.core import security
from app.models.security_state import TotpReplayEntry
from app.services.xml_export_service import Ech0119ExportService, generate_ech_xml


def test_production_totp_fails_closed_when_db_unavailable(monkeypatch):
    monkeypatch.setattr(security.settings, 'ENVIRONMENT', 'production')
    monkeypatch.setattr(security.settings, 'ALLOW_TEST_2FA_BYPASS', False)
    monkeypatch.setattr(security, '_get_sync_security_engine', lambda: None)
    secret = pyotp.random_base32()
    assert not security.verify_totp_code(secret, pyotp.TOTP(secret).now())


def test_production_totp_fails_closed_when_db_write_fails(monkeypatch, tmp_path):
    # Engine points at a fresh DB WITHOUT the migrated totp_replay_entries table -> SQL write fails in prod -> fails closed
    unmigrated = create_engine(f"sqlite:///{tmp_path / 'empty_unmigrated.db'}", connect_args={"check_same_thread": False})
    monkeypatch.setattr(security.settings, 'ENVIRONMENT', 'production')
    monkeypatch.setattr(security.settings, 'ALLOW_TEST_2FA_BYPASS', False)
    monkeypatch.setattr(security, '_get_sync_security_engine', lambda: unmigrated)
    secret = pyotp.random_base32()
    assert not security.verify_totp_code(secret, pyotp.TOTP(secret).now())


def test_production_totp_replay_is_rejected_across_workers(monkeypatch, tmp_path):
    db_file = tmp_path / "shared_totp_workers.db"
    db_url = f"sqlite:///{db_file}"
    setup_eng = create_engine(db_url, connect_args={"check_same_thread": False})
    TotpReplayEntry.__table__.create(bind=setup_eng, checkfirst=True)
    setup_eng.dispose()

    worker1_eng = create_engine(db_url, connect_args={"check_same_thread": False})
    worker2_eng = create_engine(db_url, connect_args={"check_same_thread": False})

    monkeypatch.setattr(security.settings, 'ENVIRONMENT', 'production')
    monkeypatch.setattr(security.settings, 'ALLOW_TEST_2FA_BYPASS', False)

    secret = pyotp.random_base32()
    code = pyotp.TOTP(secret).now()

    monkeypatch.setattr(security, '_get_sync_security_engine', lambda: worker1_eng)
    assert security.verify_totp_code(secret, code)

    # Worker 2 (separate engine / restarted process) rejects the same code via shared SQL constraint
    monkeypatch.setattr(security, '_get_sync_security_engine', lambda: worker2_eng)
    assert not security.verify_totp_code(secret, code)

    worker1_eng.dispose()
    worker2_eng.dispose()


def test_schema_compilation_does_not_install_global_url_opener(monkeypatch):
    def forbidden(*args, **kwargs):
        raise AssertionError('global opener must not be replaced')
    monkeypatch.setattr(urllib.request, 'install_opener', forbidden)
    service = Ech0119ExportService()
    service._init_validator()
    assert service._schema_validator is not None
    valid, errors = service.validate_xml('<message/>')
    assert not valid and errors


def _data(canton, federal, deductions=None):
    tr = SimpleNamespace(id='test-return', canton_code='ZH', municipality_name='Winterthur', municipality_code='230', tax_year=2025, taxpayer_name='Test Person')
    profile = SimpleNamespace(personal_data={'first_name': 'Test', 'last_name': 'Person', 'civil_status': 'ledig', 'ahv_number': '756.9217.0769.85'}, income_data={'employment_income': 100000}, deductions_data=deductions or {}, wealth_data={})
    calc = SimpleNamespace(calculation_details={'canton_deductions_list': canton, 'federal_deductions_list': federal}, taxable_income=90000, taxable_wealth=0)
    return tr, profile, calc


def test_export_rejects_missing_federal_even_if_canton_is_zero():
    args = _data([{'code': 'commute_total', 'amount': 0}], [])
    with pytest.raises(ValueError, match='federal commuting'):
        generate_ech_xml(*args)


def test_export_rejects_profile_fallback_when_snapshot_missing():
    args = _data([], [], {'commuting_deduction': 2500})
    with pytest.raises(ValueError, match='missing commuting deductions'):
        generate_ech_xml(*args)


def test_export_accepts_explicit_zero_on_both_sides():
    entries = [{'code': 'commute_total', 'amount': 0}]
    xml = generate_ech_xml(*_data(entries, entries))
    assert '<message' in xml
