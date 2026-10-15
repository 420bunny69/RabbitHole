from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect

BACKEND_DIR = Path(__file__).resolve().parents[1]
APP_TABLES = {"items", "concepts", "item_concepts", "suggestions"}


def make_config(db_file: Path) -> Config:
    """Alembic config pointing at a temporary database instead of the real one."""
    cfg = Config()
    # "%" must be doubled because Alembic config values go through string interpolation.
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic").replace("%", "%%"))
    cfg.set_main_option("sqlalchemy.url", f"sqlite:///{db_file}".replace("%", "%%"))
    return cfg


def table_names(db_file: Path) -> set[str]:
    engine = create_engine(f"sqlite:///{db_file}")
    try:
        return set(inspect(engine).get_table_names())
    finally:
        engine.dispose()


def test_upgrade_creates_all_tables(tmp_path):
    db_file = tmp_path / "migrate.db"
    command.upgrade(make_config(db_file), "head")
    assert APP_TABLES <= table_names(db_file)


def test_downgrade_removes_all_tables(tmp_path):
    db_file = tmp_path / "migrate.db"
    cfg = make_config(db_file)
    command.upgrade(cfg, "head")
    command.downgrade(cfg, "base")
    assert not (APP_TABLES & table_names(db_file))


def test_migrations_match_models(tmp_path):
    """Fails if someone changes app/models.py but forgets to create a migration."""
    db_file = tmp_path / "migrate.db"
    cfg = make_config(db_file)
    command.upgrade(cfg, "head")
    command.check(cfg)  # raises CommandError if the models and the migrations disagree
