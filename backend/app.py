from flask import Flask, request, jsonify, abort
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from functools import wraps
import os
import numpy as np
import yfinance as yf
from datetime import datetime, timezone
from dotenv import load_dotenv
from config import config, get_db_url
import jwt

load_dotenv()

app = Flask(__name__)

# Allow requests from any origin in dev; restrict to FRONTEND_URL in prod
frontend_url = os.environ.get("FRONTEND_URL", "*")
CORS(app, origins=frontend_url)

env = os.environ.get("FLASK_ENV", "development")
app.config.from_object(config[env])

# Always resolve DATABASE_URL here, after load_dotenv(), regardless of FLASK_ENV
app.config["SQLALCHEMY_DATABASE_URI"] = get_db_url()
print(f"[startup] env={env}  db={app.config['SQLALCHEMY_DATABASE_URI'][:40]}...")

db = SQLAlchemy(app)


# ---------------------------------------------------------------------------
# Clerk JWT auth
# ---------------------------------------------------------------------------

def _verify_clerk_token(token):
    """Decode and verify a Clerk JWT using the PEM public key."""
    pem = os.environ.get("CLERK_JWT_PUBLIC_KEY")
    if not pem:
        raise RuntimeError("CLERK_JWT_PUBLIC_KEY env var is not set")
    # Env vars can't contain literal newlines easily, so allow \n as escape
    pem = pem.replace("\\n", "\n")
    return jwt.decode(
        token,
        pem,
        algorithms=["RS256"],
        options={"verify_aud": False},
    )


def require_auth(f):
    """Decorator that requires a valid Clerk JWT in the Authorization header."""
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            abort(401, "Missing or invalid Authorization header")
        token = auth_header[7:]
        try:
            _verify_clerk_token(token)
        except Exception as e:
            abort(401, f"Invalid token: {e}")
        return f(*args, **kwargs)
    return decorated


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class Stock(db.Model):
    __tablename__ = "stocks"

    ticker   = db.Column(db.String(10), primary_key=True)
    company  = db.Column(db.String(200), nullable=False)
    sector   = db.Column(db.String(100))
    industry = db.Column(db.String(100))
    website  = db.Column(db.String(200))
    id       = db.Column(db.Integer, db.Sequence("stocks_id_seq"), unique=True, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "ticker": self.ticker,
            "company": self.company,
            "sector": self.sector,
            "industry": self.industry,
            "website": self.website,
        }


class StockFactor(db.Model):
    __tablename__ = "stock_factors"

    ticker       = db.Column(db.String(10), db.ForeignKey("stocks.ticker", ondelete="CASCADE"), primary_key=True)
    market_cap   = db.Column(db.BigInteger)   # SMB proxy
    beta         = db.Column(db.Float)         # Market factor
    pb_ratio     = db.Column(db.Float)         # HML proxy  (lower P/B = more value)
    roe          = db.Column(db.Float)         # RMW proxy  (higher = more profitable)
    asset_growth = db.Column(db.Float)         # CMA proxy  (lower = more conservative)
    last_updated = db.Column(db.DateTime(timezone=True))

    def to_dict(self):
        return {
            "ticker":       self.ticker,
            "market_cap":   self.market_cap,
            "beta":         self.beta,
            "pb_ratio":     self.pb_ratio,
            "roe":          self.roe,
            "asset_growth": self.asset_growth,
            "last_updated": self.last_updated.isoformat() if self.last_updated else None,
        }


class StockMomentum(db.Model):
    __tablename__ = "stock_momentum"

    ticker    = db.Column(db.String(10), db.ForeignKey("stocks.ticker", ondelete="CASCADE"), primary_key=True)
    ret_1m    = db.Column(db.Float)   # 1-month return
    ret_3m    = db.Column(db.Float)   # 3-month return
    ret_6m    = db.Column(db.Float)   # 6-month return
    ret_12_1m = db.Column(db.Float)   # 12-1 month return (Carhart WML)
    rsi_14    = db.Column(db.Float)   # 14-day RSI
    vs_200ma  = db.Column(db.Float)   # % above/below 200-day MA
    last_updated = db.Column(db.DateTime(timezone=True))

    def to_dict(self):
        return {
            "ticker":       self.ticker,
            "ret_1m":       self.ret_1m,
            "ret_3m":       self.ret_3m,
            "ret_6m":       self.ret_6m,
            "ret_12_1m":    self.ret_12_1m,
            "rsi_14":       self.rsi_14,
            "vs_200ma":     self.vs_200ma,
            "last_updated": self.last_updated.isoformat() if self.last_updated else None,
        }


class StockNote(db.Model):
    __tablename__ = "stock_notes"

    id         = db.Column(db.Integer, primary_key=True, autoincrement=True)
    ticker     = db.Column(db.String(10), db.ForeignKey("stocks.ticker", ondelete="CASCADE"), nullable=False)
    content    = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id":         self.id,
            "ticker":     self.ticker,
            "content":    self.content,
            "created_at": self.created_at.isoformat(),
        }


# Create all tables now that models are defined
with app.app_context():
    db.create_all()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def percentile_scores(items, key, higher_is_better=True):
    """Return a dict of ticker → 0-100 score. Missing values → 50 (neutral)."""
    valid = [(item["ticker"], item[key])
             for item in items
             if item.get(key) is not None and not np.isnan(float(item[key]))]

    result = {item["ticker"]: 50.0 for item in items}
    if len(valid) < 2:
        return result

    _, vals = zip(*valid)
    arr = np.array(vals, dtype=float)

    for ticker, val in valid:
        below = float(np.sum(arr < val))
        equal = float(np.sum(arr == val))
        raw = (below + 0.5 * equal) / len(arr) * 100
        result[ticker] = raw if higher_is_better else 100 - raw

    return result


def fmt_safe(val):
    """Return float or None; guards against NaN."""
    if val is None:
        return None
    try:
        f = float(val)
        return None if np.isnan(f) else f
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------------------
# Stock routes
# ---------------------------------------------------------------------------

@app.route("/api/stocks", methods=["GET"])
@require_auth
def get_stocks():
    stocks = Stock.query.order_by(Stock.ticker).all()
    return jsonify([s.to_dict() for s in stocks])


@app.route("/api/stocks", methods=["POST"])
@require_auth
def create_stock():
    data    = request.get_json(silent=True) or {}
    ticker  = (data.get("ticker") or "").strip().upper()
    company = (data.get("company") or "").strip()
    if not ticker or not company:
        abort(400, "ticker and company are required")
    if Stock.query.get(ticker):
        abort(409, f"Stock {ticker} already exists")
    stock = Stock(
        ticker=ticker, company=company,
        sector=(data.get("sector") or "").strip() or None,
        industry=(data.get("industry") or "").strip() or None,
        website=(data.get("website") or "").strip() or None,
    )
    db.session.add(stock)
    db.session.commit()
    return jsonify(stock.to_dict()), 201


@app.route("/api/stocks/<ticker>", methods=["GET"])
@require_auth
def get_stock(ticker):
    stock = Stock.query.get_or_404(ticker.upper())
    return jsonify(stock.to_dict())


@app.route("/api/stocks/<ticker>", methods=["PUT"])
@require_auth
def update_stock(ticker):
    stock   = Stock.query.get_or_404(ticker.upper())
    data    = request.get_json(silent=True) or {}
    company = (data.get("company") or "").strip()
    if not company:
        abort(400, "company is required")
    stock.company  = company
    stock.sector   = (data.get("sector") or "").strip() or None
    stock.industry = (data.get("industry") or "").strip() or None
    stock.website  = (data.get("website") or "").strip() or None
    db.session.commit()
    return jsonify(stock.to_dict())


@app.route("/api/stocks/<ticker>", methods=["DELETE"])
@require_auth
def delete_stock(ticker):
    stock = Stock.query.get_or_404(ticker.upper())
    db.session.delete(stock)
    db.session.commit()
    return "", 204


# ---------------------------------------------------------------------------
# Factor routes
# ---------------------------------------------------------------------------

@app.route("/api/factors", methods=["GET"])
@require_auth
def get_factors():
    stocks  = {s.ticker: s for s in Stock.query.all()}
    factors = {f.ticker: f for f in StockFactor.query.all()}
    result  = []
    for ticker, stock in stocks.items():
        f = factors.get(ticker)
        result.append({
            "ticker":       ticker,
            "company":      stock.company,
            "market_cap":   f.market_cap   if f else None,
            "beta":         f.beta         if f else None,
            "pb_ratio":     f.pb_ratio     if f else None,
            "roe":          f.roe          if f else None,
            "asset_growth": f.asset_growth if f else None,
            "last_updated": f.last_updated.isoformat() if f and f.last_updated else None,
        })
    return jsonify(result)


@app.route("/api/factors/refresh", methods=["POST"])
@require_auth
def refresh_factors():
    stocks  = Stock.query.all()
    updated = []
    errors  = []

    for stock in stocks:
        try:
            yticker = yf.Ticker(stock.ticker)
            info    = yticker.info

            market_cap = fmt_safe(info.get("marketCap"))
            beta       = fmt_safe(info.get("beta"))
            pb_ratio   = fmt_safe(info.get("priceToBook"))
            roe        = fmt_safe(info.get("returnOnEquity"))

            # Asset growth: (current total assets − prior) / |prior|
            asset_growth = None
            try:
                bs = yticker.balance_sheet
                if bs is not None and not bs.empty and bs.shape[1] >= 2:
                    label = next((l for l in bs.index if "total assets" in l.lower()), None)
                    if label:
                        curr = fmt_safe(bs.loc[label].iloc[0])
                        prev = fmt_safe(bs.loc[label].iloc[1])
                        if curr is not None and prev and prev != 0:
                            asset_growth = (curr - prev) / abs(prev)
            except Exception:
                pass

            f = StockFactor.query.get(stock.ticker)
            if f is None:
                f = StockFactor(ticker=stock.ticker)
                db.session.add(f)

            f.market_cap   = int(market_cap) if market_cap else None
            f.beta         = beta
            f.pb_ratio     = pb_ratio
            f.roe          = roe
            f.asset_growth = asset_growth
            f.last_updated = datetime.now(timezone.utc)

            updated.append(stock.ticker)
        except Exception as e:
            errors.append({"ticker": stock.ticker, "error": str(e)})

    db.session.commit()
    return jsonify({"updated": updated, "errors": errors})


# ---------------------------------------------------------------------------
# Momentum routes
# ---------------------------------------------------------------------------

def calc_rsi(close, period=14):
    delta = close.diff()
    gain  = delta.clip(lower=0).rolling(period).mean()
    loss  = (-delta.clip(upper=0)).rolling(period).mean()
    rs    = gain / loss
    return (100 - (100 / (1 + rs))).iloc[-1]


@app.route("/api/momentum", methods=["GET"])
@require_auth
def get_momentum():
    stocks   = {s.ticker: s for s in Stock.query.all()}
    momentum = {m.ticker: m for m in StockMomentum.query.all()}
    result   = []
    for ticker, stock in stocks.items():
        m = momentum.get(ticker)
        result.append({
            "ticker":       ticker,
            "company":      stock.company,
            "ret_1m":       m.ret_1m       if m else None,
            "ret_3m":       m.ret_3m       if m else None,
            "ret_6m":       m.ret_6m       if m else None,
            "ret_12_1m":    m.ret_12_1m    if m else None,
            "rsi_14":       m.rsi_14       if m else None,
            "vs_200ma":     m.vs_200ma     if m else None,
            "last_updated": m.last_updated.isoformat() if m and m.last_updated else None,
        })
    return jsonify(result)


@app.route("/api/momentum/refresh", methods=["POST"])
@require_auth
def refresh_momentum():
    stocks  = Stock.query.all()
    updated = []
    errors  = []

    for stock in stocks:
        try:
            hist = yf.Ticker(stock.ticker).history(period="13mo")
            if hist.empty or len(hist) < 20:
                raise ValueError("Insufficient price history")

            close = hist["Close"]
            n     = len(close)

            # Period returns (trading days: ~21/63/126/252 per 1/3/6/12m)
            ret_1m    = fmt_safe(close.iloc[-1] / close.iloc[-min(21,  n)] - 1)
            ret_3m    = fmt_safe(close.iloc[-1] / close.iloc[-min(63,  n)] - 1)
            ret_6m    = fmt_safe(close.iloc[-1] / close.iloc[-min(126, n)] - 1)

            # WML: return from ~12 months ago to ~1 month ago (skips last month)
            if n >= 252:
                ret_12_1m = fmt_safe(close.iloc[-21] / close.iloc[-252] - 1)
            elif n >= 42:
                ret_12_1m = fmt_safe(close.iloc[-21] / close.iloc[0] - 1)
            else:
                ret_12_1m = None

            # 14-day RSI
            rsi_14 = fmt_safe(calc_rsi(close)) if n >= 20 else None

            # Price vs 200-day MA
            ma_200  = close.rolling(200).mean()
            vs_200ma = fmt_safe(close.iloc[-1] / ma_200.iloc[-1] - 1) if n >= 200 else None

            m = StockMomentum.query.get(stock.ticker)
            if m is None:
                m = StockMomentum(ticker=stock.ticker)
                db.session.add(m)

            m.ret_1m    = ret_1m
            m.ret_3m    = ret_3m
            m.ret_6m    = ret_6m
            m.ret_12_1m = ret_12_1m
            m.rsi_14    = rsi_14
            m.vs_200ma  = vs_200ma
            m.last_updated = datetime.now(timezone.utc)

            updated.append(stock.ticker)
        except Exception as e:
            errors.append({"ticker": stock.ticker, "error": str(e)})

    db.session.commit()
    return jsonify({"updated": updated, "errors": errors})


# ---------------------------------------------------------------------------
# Notes routes
# ---------------------------------------------------------------------------

@app.route("/api/stocks/<ticker>/notes", methods=["GET"])
@require_auth
def get_notes(ticker):
    Stock.query.get_or_404(ticker.upper())
    notes = (StockNote.query
             .filter_by(ticker=ticker.upper())
             .order_by(StockNote.created_at.desc())
             .all())
    return jsonify([n.to_dict() for n in notes])


@app.route("/api/stocks/<ticker>/notes", methods=["POST"])
@require_auth
def create_note(ticker):
    Stock.query.get_or_404(ticker.upper())
    data    = request.get_json(silent=True) or {}
    content = (data.get("content") or "").strip()
    if not content:
        abort(400, "content is required")
    note = StockNote(ticker=ticker.upper(), content=content)
    db.session.add(note)
    db.session.commit()
    return jsonify(note.to_dict()), 201


@app.route("/api/stocks/<ticker>/notes/<int:note_id>", methods=["DELETE"])
@require_auth
def delete_note(ticker, note_id):
    note = StockNote.query.filter_by(id=note_id, ticker=ticker.upper()).first_or_404()
    db.session.delete(note)
    db.session.commit()
    return "", 204


# ---------------------------------------------------------------------------
# Error handlers
# ---------------------------------------------------------------------------

@app.errorhandler(400)
@app.errorhandler(401)
@app.errorhandler(404)
@app.errorhandler(409)
def handle_error(e):
    return jsonify({"error": e.description}), e.code


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    app.run(host="0.0.0.0", port=port)
