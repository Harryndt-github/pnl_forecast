"""
Pytest fixtures for the automated test suite.

Adds the repo root to sys.path so `import app` works, and exposes a
Flask test client. These tests do NOT require a database connection:
they cover pure helpers and HTTP-layer behaviour (auth gate, health
endpoint shape, static serving).
"""
import os
import sys

import pytest

# Make the repo root importable (app.py lives one level up).
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)


@pytest.fixture(scope="session")
def flask_app():
    import app as app_module
    app_module.app.config.update(TESTING=True)
    return app_module.app


@pytest.fixture()
def client(flask_app):
    return flask_app.test_client()
