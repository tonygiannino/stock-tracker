import os


def _fix_db_url(url):
    """Railway provides postgres:// but SQLAlchemy requires postgresql://"""
    if url and url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql://", 1)
    return url


class Config:
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SECRET_KEY = os.environ.get("SECRET_KEY", "change-me-in-production")


class DevelopmentConfig(Config):
    DEBUG = True
    SQLALCHEMY_DATABASE_URI = _fix_db_url(
        os.environ.get("DATABASE_URL", "postgresql://localhost/stocks")
    )


class ProductionConfig(Config):
    DEBUG = False
    SQLALCHEMY_DATABASE_URI = _fix_db_url(os.environ.get("DATABASE_URL"))


config = {
    "development": DevelopmentConfig,
    "production":  ProductionConfig,
    "default":     DevelopmentConfig,
}
