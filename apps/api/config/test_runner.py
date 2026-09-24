"""`manage.py test` → pytest (тесты в apps/tests написаны в стиле pytest-django)."""


class PytestTestRunner:
    def __init__(self, verbosity=1, failfast=False, keepdb=False, **kwargs):
        self.verbosity = verbosity
        self.failfast = failfast
        self.keepdb = keepdb

    @classmethod
    def add_arguments(cls, parser):
        parser.add_argument("--keepdb", action="store_true", help="Preserves the test DB between runs.")

    def run_tests(self, test_labels, **kwargs):
        import pytest

        argv = []
        if self.verbosity == 0:
            argv.append("--quiet")
        elif self.verbosity >= 2:
            argv.append("-" + "v" * (self.verbosity - 1))
        if self.failfast:
            argv.append("--exitfirst")
        if self.keepdb:
            argv.append("--reuse-db")
        argv.extend(test_labels)
        return pytest.main(argv)
