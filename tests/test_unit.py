"""
Unit tests for pure helper functions in app.py — no DB / network needed.
"""
import app as app_module


class TestSafeFloat:
    def test_none_returns_zero(self):
        assert app_module.safe_float(None) == 0.0

    def test_numeric_string(self):
        assert app_module.safe_float("3.5") == 3.5

    def test_int(self):
        assert app_module.safe_float(5) == 5.0

    def test_invalid_string_returns_zero(self):
        assert app_module.safe_float("not-a-number") == 0.0

    def test_empty_string_returns_zero(self):
        assert app_module.safe_float("") == 0.0


class TestMonthRangeForDatekey:
    def test_mid_year_month(self):
        start, end = app_module._month_range_for_datekey(202604)
        assert start == "2026-04-01"
        assert end == "2026-05-01"

    def test_december_rolls_to_next_year(self):
        start, end = app_module._month_range_for_datekey(202612)
        assert start == "2026-12-01"
        assert end == "2027-01-01"

    def test_january(self):
        start, end = app_module._month_range_for_datekey(202601)
        assert start == "2026-01-01"
        assert end == "2026-02-01"

    def test_accepts_string_datekey(self):
        start, end = app_module._month_range_for_datekey("202607")
        assert start == "2026-07-01"
        assert end == "2026-08-01"
