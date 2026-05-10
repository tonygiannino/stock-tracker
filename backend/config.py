import os


def _fix_db_url(url):
    """Railway provides postgres:// but SQLAlchemy requires postgresql://"""
    if url and url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql://", 1)
    return url


def get_db_url():
    """Always prefer DATABASE_URL from the environment, fall back to local dev."""
    url = os.environ.get("DATABASE_URL", "postgresql://localhost/stocks")
    return _fix_db_url(url)


class Config:
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SECRET_KEY = os.environ.get("SECRET_KEY", "change-me-in-production")


class DevelopmentConfig(Config):
    DEBUG = True


class ProductionConfig(Config):
    DEBUG = False


config = {
    "development": DevelopmentConfig,
    "production":  ProductionConfig,
    "default":     DevelopmentConfig,
}
