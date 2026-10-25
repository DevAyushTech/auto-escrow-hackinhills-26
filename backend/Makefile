PYTHON ?= $(if $(wildcard .venv/bin/python),.venv/bin/python,python)

.PHONY: install test run migrate migrate-down seed compile migration-check

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

migration-check:
	@set -e; db_path=$$(mktemp -u /tmp/auto-escrow-migrations.XXXXXX.sqlite3); \
	APP_ENV=test TEST_DATABASE_URL=sqlite:////$$db_path PYTHONPATH=. $(PYTHON) -m alembic upgrade head; \
	APP_ENV=test TEST_DATABASE_URL=sqlite:////$$db_path PYTHONPATH=. $(PYTHON) -m alembic downgrade base; \
	APP_ENV=test TEST_DATABASE_URL=sqlite:////$$db_path PYTHONPATH=. $(PYTHON) -m alembic upgrade head; \
	APP_ENV=test TEST_DATABASE_URL=sqlite:////$$db_path PYTHONPATH=. $(PYTHON) -m alembic current; \
	rm -f $$db_path
