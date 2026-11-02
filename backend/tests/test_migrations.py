from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect

BACKEND_DIR = Path(__file__).resolve().parents[1]
APP_TABLES = {"items", "concepts", "item_concepts", "suggestions", "workspaces", "user_workspaces"}


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


def test_claim_token_migration_only_changes_workspace_columns(tmp_path):
    import uuid
    from sqlalchemy import text

    db_file = tmp_path / "claim_columns.db"
    cfg = make_config(db_file)
    command.upgrade(cfg, "a1b2c3d4e5f6")

    workspace_id = uuid.uuid4().hex
    user_id = uuid.uuid4().hex
    engine = create_engine(f"sqlite:///{db_file}")
    with engine.begin() as conn:
        conn.execute(
            text("INSERT INTO workspaces (id, name, created_at) VALUES (:id, 'Existing', CURRENT_TIMESTAMP)"),
            {"id": workspace_id},
        )
        conn.execute(
            text("INSERT INTO user_workspaces (user_id, workspace_id, role, created_at) "
                 "VALUES (:user_id, :workspace_id, 'owner', CURRENT_TIMESTAMP)"),
            {"user_id": user_id, "workspace_id": workspace_id},
        )

    command.upgrade(cfg, "head")
    workspace_columns = {column["name"] for column in inspect(engine).get_columns("workspaces")}
    assert {"claim_token_hash", "claim_expires_at"} <= workspace_columns

    command.downgrade(cfg, "a1b2c3d4e5f6")
    workspace_columns = {column["name"] for column in inspect(engine).get_columns("workspaces")}
    assert not {"claim_token_hash", "claim_expires_at"} & workspace_columns
    assert {"id", "name", "created_at"} <= workspace_columns
    with engine.connect() as conn:
        assert conn.execute(text("SELECT id FROM workspaces")).scalar() == workspace_id
        assert conn.execute(text("SELECT user_id FROM user_workspaces")).scalar() == user_id

    engine.dispose()


def test_migration_backfill_and_reupgrade(tmp_path):
    """Verify that existing items and concepts are backfilled into workspaces,
    duplicates across items/concepts produce only one workspace, and existing data is preserved."""
    import uuid
    from sqlalchemy import text

    db_file = tmp_path / "test_backfill.db"
    cfg = make_config(db_file)

    # 1. Upgrade to the previous revision (92b3fafb427b) before workspaces existed
    command.upgrade(cfg, "92b3fafb427b")

    engine = create_engine(f"sqlite:///{db_file}")
    with engine.begin() as conn:
        # Create test items and concepts under owner1 and owner2
        owner1 = uuid.uuid4().hex
        owner2 = uuid.uuid4().hex

        item1_id = uuid.uuid4().hex
        item2_id = uuid.uuid4().hex

        conn.execute(
            text(
                "INSERT INTO items (id, owner_id, source_type, title, status, created_at) "
                "VALUES (:id, :owner_id, 'article', 'Test Article 1', 'ready', CURRENT_TIMESTAMP)"
            ),
            {"id": item1_id, "owner_id": owner1},
        )
        conn.execute(
            text(
                "INSERT INTO items (id, owner_id, source_type, title, status, created_at) "
                "VALUES (:id, :owner_id, 'article', 'Test Article 2', 'ready', CURRENT_TIMESTAMP)"
            ),
            {"id": item2_id, "owner_id": owner2},
        )

        conn.execute(
            text("INSERT INTO concepts (id, owner_id, name) VALUES (1, :owner_id, 'concept 1')"),
            {"owner_id": owner1},
        )
        conn.execute(
            text("INSERT INTO concepts (id, owner_id, name) VALUES (2, :owner_id, 'concept 2')"),
            {"owner_id": owner1},  # Duplicate owner1 in concepts
        )
        conn.execute(
            text("INSERT INTO concepts (id, owner_id, name) VALUES (3, :owner_id, 'concept 3')"),
            {"owner_id": owner2},
        )

        # Link item1 to concept 1
        conn.execute(
            text("INSERT INTO item_concepts (item_id, concept_id, relevance) VALUES (:item_id, 1, 0.9)"),
            {"item_id": item1_id},
        )

    # 2. Upgrade to head (runs the new migration and backfill)
    command.upgrade(cfg, "head")

    with engine.connect() as conn:
        # Verify workspaces table exists and contains exactly 2 workspaces (owner1 and owner2)
        workspaces = conn.execute(text("SELECT id, name FROM workspaces ORDER BY id")).fetchall()
        ws_ids = {row[0] for row in workspaces}
        assert len(workspaces) == 2
        assert owner1 in ws_ids
        assert owner2 in ws_ids

        # Verify user_workspaces is completely empty (no Supabase users linked yet)
        user_ws_count = conn.execute(text("SELECT COUNT(*) FROM user_workspaces")).scalar()
        assert user_ws_count == 0

        # Verify existing items, concepts, and relationships are 100% intact
        item_count = conn.execute(text("SELECT COUNT(*) FROM items")).scalar()
        concept_count = conn.execute(text("SELECT COUNT(*) FROM concepts")).scalar()
        link_count = conn.execute(text("SELECT COUNT(*) FROM item_concepts")).scalar()
        assert item_count == 2
        assert concept_count == 3
        assert link_count == 1

        # Check item1 details
        item1 = conn.execute(text("SELECT title, status FROM items WHERE id = :id"), {"id": item1_id}).fetchone()
        assert item1[0] == "Test Article 1"
        assert item1[1] == "ready"

    # 3. Downgrade back to 92b3fafb427b
    command.downgrade(cfg, "92b3fafb427b")

    with engine.connect() as conn:
        # Verify workspaces and user_workspaces are dropped
        current_tables = set(inspect(engine).get_table_names())
        assert "workspaces" not in current_tables
        assert "user_workspaces" not in current_tables

        # Verify items, concepts, item_concepts are still intact
        assert conn.execute(text("SELECT COUNT(*) FROM items")).scalar() == 2
        assert conn.execute(text("SELECT COUNT(*) FROM concepts")).scalar() == 3
        assert conn.execute(text("SELECT COUNT(*) FROM item_concepts")).scalar() == 1

    # 4. Re-upgrade to head works cleanly
    command.upgrade(cfg, "head")
    with engine.connect() as conn:
        assert conn.execute(text("SELECT COUNT(*) FROM workspaces")).scalar() == 2

    engine.dispose()

