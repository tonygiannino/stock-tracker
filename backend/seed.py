from app import app, db, Stock

STOCKS = [
    ("AAPL",  "Apple Inc.",                    "Technology", "Consumer Electronics",        "https://apple.com"),
    ("MSFT",  "Microsoft Corporation",          "Technology", "Software - Infrastructure",   "https://microsoft.com"),
    ("NVDA",  "NVIDIA Corporation",             "Technology", "Semiconductors",              "https://nvidia.com"),
    ("GOOGL", "Alphabet Inc.",                  "Technology", "Internet Content & Information", "https://abc.xyz"),
    ("META",  "Meta Platforms Inc.",            "Technology", "Internet Content & Information", "https://meta.com"),
    ("AMZN",  "Amazon.com Inc.",                "Consumer Cyclical", "Internet Retail",      "https://amazon.com"),
    ("TSLA",  "Tesla Inc.",                     "Consumer Cyclical", "Auto Manufacturers",   "https://tesla.com"),
    ("AVGO",  "Broadcom Inc.",                  "Technology", "Semiconductors",              "https://broadcom.com"),
    ("ORCL",  "Oracle Corporation",             "Technology", "Software - Infrastructure",   "https://oracle.com"),
    ("CRM",   "Salesforce Inc.",                "Technology", "Software - Application",      "https://salesforce.com"),
    ("AMD",   "Advanced Micro Devices Inc.",    "Technology", "Semiconductors",              "https://amd.com"),
    ("INTC",  "Intel Corporation",              "Technology", "Semiconductors",              "https://intel.com"),
    ("QCOM",  "Qualcomm Inc.",                  "Technology", "Semiconductors",              "https://qualcomm.com"),
    ("IBM",   "IBM Corporation",                "Technology", "Information Technology Services", "https://ibm.com"),
    ("NOW",   "ServiceNow Inc.",                "Technology", "Software - Application",      "https://servicenow.com"),
    ("ADBE",  "Adobe Inc.",                     "Technology", "Software - Application",      "https://adobe.com"),
    ("SNOW",  "Snowflake Inc.",                 "Technology", "Software - Application",      "https://snowflake.com"),
    ("UBER",  "Uber Technologies Inc.",         "Technology", "Software - Application",      "https://uber.com"),
    ("SHOP",  "Shopify Inc.",                   "Technology", "Software - Application",      "https://shopify.com"),
    ("NET",   "Cloudflare Inc.",                "Technology", "Software - Infrastructure",   "https://cloudflare.com"),
]

with app.app_context():
    added = 0
    skipped = 0
    for ticker, company, sector, industry, website in STOCKS:
        if Stock.query.get(ticker):
            print(f"  skipping {ticker} (already exists)")
            skipped += 1
        else:
            db.session.add(Stock(
                ticker=ticker,
                company=company,
                sector=sector,
                industry=industry,
                website=website,
            ))
            print(f"  adding {ticker} - {company}")
            added += 1
    db.session.commit()
    print(f"\nDone — {added} added, {skipped} skipped.")
