"""SQLAlchemy sessions and SQLite foreign key enforcement."""

from functools import lru_cache

from sqlalchemy import MetaData, create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import get_settings


class Base(DeclarativeBase):
    metadata = MetaData(
        naming_convention={
            "ix": "ix_%(table_name)s_%(column_0_name)s",
            "uq": "uq_%(table_name)s_%(column_0_name)s",
            "ck": "ck_%(table_name)s_%(constraint_name)s",
            "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
            "pk": "pk_%(table_name)s",
        }
    )


def make_engine(url: str):
    engine = create_engine(url, connect_args={"check_same_thread": False, "timeout": 20})

    @event.listens_for(engine, "connect")
    def sqlite_pragmas(connection, _):
        cursor = connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA busy_timeout=20000")
        cursor.close()

    return engine


@lru_cache
def get_engine():
    return make_engine(get_settings().DATABASE_URL)


def new_session():
    return sessionmaker(bind=get_engine(), expire_on_commit=False, autoflush=False)()


def get_db():
    with new_session() as session:
        try:
            yield session
        except Exception:
            session.rollback()
            raise
