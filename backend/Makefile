PYTHON ?= $(if $(wildcard .venv/bin/python),.venv/bin/python,python)

.PHONY: install test run migrate migrate-down seed compile

install:
	$(PYTHON) -m pip install -r requirements.txt

test:
	PYTHONPATH=. $(PYTHON) -m pytest

run:
	$(PYTHON) -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

migrate:
	$(PYTHON) -m alembic upgrade head

migrate-down:
	$(PYTHON) -m alembic downgrade -1

seed:
	PYTHONPATH=. $(PYTHON) -m app.seed --with-jobs

compile:
	PYTHONPATH=. $(PYTHON) -m compileall -q app migrations tests
