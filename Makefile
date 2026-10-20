.PHONY: test backend-test frontend-test

test: backend-test frontend-test

backend-test:
	$(MAKE) -C backend test

frontend-test:
	npm --prefix frontend run test
