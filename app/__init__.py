import pathlib
# Extend this package's __path__ to include the backend's app directory,
# allowing imports like `from app import models` to resolve to
# `backend/app` without modifying the test configuration.
__path__.append(str(pathlib.Path(__file__).parents[1] / 'backend' / 'app'))
