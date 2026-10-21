"""
"
*Make sure you have Python 3 and the required libraries installed.
How to run this ETL script:
set DB_PASS=your_mysql_password
python etl.py run
python etl.py validate
"
"""

import logging
import os
import sys

import pandas as pd
from sqlalchemy import create_engine, text

# These are for connecting to the source and warehouse databases. 
# They can be set as environment variables or will default to the values below.
USER = os.getenv("DB_USER", "root")
PASS = os.getenv("DB_PASS", "yehey123")
HOST = os.getenv("DB_HOST", "localhost")
PORT = os.getenv("DB_PORT", "3306")
SRC_DB = os.getenv("SOURCE_DB", "financedata")
WH_DB = os.getenv("WAREHOUSE_DB", "star_schema")
BATCH_SIZE = 50000

# We use Python's built-in logging module to report progress and issues.
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("etl")

# We first define a function to create a SQLAlchemy engine for connecting to a MySQL database.
# SQLAlchemy helps us run SQL queries and manage database connections in a Pythonic way.
def get_engine(db_name):
    return create_engine(f"mysql+pymysql://{USER}:{PASS}@{HOST}:{PORT}/{db_name}")

# Create one connection for the source database and one for the warehouse.
src_engine = get_engine(SRC_DB)
wh_engine = get_engine(WH_DB)

# This function profiles a table by running a SQL query to 
# fetch a sample of rows and then printing out basic statistics about the data.
def profile_table(tbl):
    query = f"SELECT * FROM {tbl} LIMIT 100000"

    # Run the SQL query and store its results in a pandas DataFrame (a table in Python).
    # The following are just some basic checks to understand the data in the table.
    df = pd.read_sql(query, src_engine)
    print(f"\n--- Data Profile: {tbl} ({len(df)} rows) ---")
    print(df.dtypes)
    print("\nNulls:\n", df.isna().sum())
    print("\nDupes:", df.duplicated().sum())
    print("\nStats:\n", df.describe())
    for c in df.select_dtypes(include=["object", "string"]).columns:
        print(f"Unique {c}: {df[c].nunique()}")

# This function reads data from a source table in chunks, 
# which is useful for large tables that might not fit into memory all at once.
def read_source(tbl):
    log.info(f"Reading source table: {tbl}")
    # chunksize makes pandas return the data in batches of BATCH_SIZE rows.
    return pd.read_sql(f"SELECT * FROM {tbl}", src_engine, chunksize=BATCH_SIZE)

# This function removes extra spaces from text columns 
# and removes rows that are exact duplicates.
def basic_clean(df):
    for c in df.select_dtypes(include=["object", "string"]).columns:
        df[c] = df[c].apply(lambda x: x.strip() if isinstance(x, str) else x)

    # Return the cleaned data after removing exact duplicate rows.
    return df.drop_duplicates()

# This function cleans the transaction data, standardizes certain labels,
# and ensures that date columns are in a consistent format.
def process_trans(df):
    df = basic_clean(df)

    if "type" in df.columns:
        # Standardize transaction types: VYBER becomes DEBIT, and Credit becomes CREDIT.
        df["type"] = df["type"].replace({"VYBER": "Debit (Withdrawal)"})
        df["type"] = df["type"].replace({"Credit": "CREDIT", "Debit (Withdrawal)": "DEBIT"})

    # This loop replaces empty strings in certain columns with 
    # pandas' NA value, which represents missing data.
    for c in ["operation", "bank", "account", "k_symbol"]:
        if c in df.columns:
            df[c] = df[c].replace("", pd.NA)

    # Use newdate when it exists; otherwise use the original date column.
    date_col = "newdate" if "newdate" in df.columns else "date"

    # If the date column exists, convert it to a pandas datetime type for easier handling.
    if date_col in df.columns:
        df["newdate"] = pd.to_datetime(df[date_col])
    return df

# This function cleans the account data, removes duplicates, 
# and ensures that the creation date is in a consistent format.
def process_account(df):
    df = basic_clean(df).drop_duplicates(subset="account_id")
    df["creation_date"] = pd.to_datetime(df["newdate"])
    df.rename(columns={"account_id": "account_ID"}, inplace=True)
    return df[["account_ID", "frequency", "creation_date"]]

# This function cleans the district data, removes duplicates,
# and ensures that numeric columns are properly typed.
def process_district(df):
    df = basic_clean(df).drop_duplicates(subset="district_id")
    numeric_cols = ["average_salary", "inhabitants", "unemployment", "ratio_urbaninhabitants"]

    # This loop converts the specified columns to numeric types, coercing errors to NaN.
    for c in numeric_cols:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    return df[["district_id", "district_name", "average_salary", "inhabitants", 
               "unemployment", "ratio_urbaninhabitants", "region"]]


# This function generates a period dimension table that includes 
# every day between the specified start and end dates.
def make_period(start="1993-01-01", end="1998-12-31"):
    # Create a date range from the start to end date, with daily frequency.
    d_range = pd.date_range(start, end, freq="D")
    df = pd.DataFrame({"complete_date": d_range})

    # These lines create additional columns for the period dimension,
    #  such as year, quarter, month, day, and day name.
    # The period_id is not created here because the warehouse generates it automatically.
    df["year"] = df["complete_date"].dt.year
    df["quarter"] = "Q" + df["complete_date"].dt.quarter.astype(str)
    df["month"] = df["complete_date"].dt.month_name()
    df["day"] = df["complete_date"].dt.day
    df["day_name"] = df["complete_date"].dt.day_name()
    return df[["complete_date", "year", "quarter", "month", "day", "day_name"]]

# This function generates a transaction type dimension table by processing
# the transaction data in batches and extracting unique 
# combinations of action, type, and symbol.
def make_type():
    frames = []
    # Process transactions in batches to avoid loading the entire table at once.
    for chunk in read_source("trans"):
        chunk = process_trans(chunk)
        cols = ["operation", "type", "k_symbol"]
        chunk[cols] = chunk[cols].fillna("N/A")
        frames.append(chunk[cols].drop_duplicates())
    res = pd.concat(frames).drop_duplicates().reset_index(drop=True)
    res.rename(columns={"operation": "action_done", "type": "transaction_type"}, inplace=True)
    return res[["action_done", "transaction_type", "k_symbol"]]

# This function writes a DataFrame to a specified warehouse table.
def write_to_wh(df, tbl):
    # Append rows to the table; index=False avoids saving the DataFrame row numbers.
    df.to_sql(tbl, wh_engine, if_exists="append", index=False, chunksize=10000)
    log.info(f"Inserted {len(df)} rows into {tbl}")

# This function clears all data from the warehouse tables,
# temporarily disabling foreign key checks to avoid constraint violations.
def clear_warehouse():
    with wh_engine.begin() as conn:
        # Temporarily disable foreign-key checks so related tables can be cleared.
        conn.execute(text("SET FOREIGN_KEY_CHECKS = 0"))
        for t in ["trans", "account", "district", "period", "type"]:
            conn.execute(text(f"TRUNCATE TABLE {t}"))
        conn.execute(text("SET FOREIGN_KEY_CHECKS = 1"))

# This function builds a partial aggregated fact table for one chunk of transactions by cleaning the data,
# adding foreign keys from the dimension tables, and summarizing the transactions
# into one row for each account, district, period, and transaction type.
def build_fact(df, acct_map, type_map, period_map):
    # First, clean the transaction data and remove duplicates based on the transaction ID.
    df = process_trans(df).drop_duplicates(subset="trans_id")
    df.rename(columns={"account_id": "account_ID", "operation": "action_done", "type": "transaction_type"}, inplace=True)
    
    # Use the transaction date to connect each transaction to the period dimension.
    df["complete_date"] = df["newdate"].dt.normalize()

    # Fill missing values in certain descriptive columns with "N/A" 
    # to ensure they can be matched to the type dimension.
    fill_cols = ["action_done", "transaction_type", "k_symbol"]
    for c in fill_cols:
        df[c] = df[c].fillna("N/A")

    # Add each account’s warehouse keys by matching the account ID.
    df = df.merge(acct_map, on="account_ID", how="left")

    # Add the transaction type key by matching the three descriptive fields.
    df = df.merge(type_map, on=["action_done", "transaction_type", "k_symbol"], how="left")

    # Add the period key by matching the transaction date.
    df = df.merge(period_map, on="complete_date", how="left")

    # Remove any rows that do not have matching foreign keys in the dimension tables.
    fk_cols = ["sys_account_ID", "sys_district_id", "period_id", "type_id"]
    before = len(df)
    df.dropna(subset=fk_cols, inplace=True)
    if len(df) < before:
        log.warning(f"Dropped {before - len(df)} rows with no matching dimension key")

    # Convert the foreign key columns to integer type to ensure 
    # they are stored correctly in the warehouse.
    for c in fk_cols:
        df[c] = df[c].astype(int)

    # Summarize the transactions by counting them and adding up their amounts for each
    # combination of foreign keys. The transaction ID, balance, and bank are not kept
    # because the fact table now stores only these aggregated values.
    df = df.groupby(fk_cols, as_index=False).agg(
        num_of_transactions=("trans_id", "count"),
        total_trans_amount=("amount", "sum"))
    return df

# This function orchestrates the entire ETL process: 
# it clears the warehouse, processes and loads dimension tables, 
# and then processes the fact table in chunks, combines the chunk totals, and loads the result.
def execute_run():
    # Start with empty warehouse tables so this run rebuilds the data from scratch.
    clear_warehouse()

    # These lines read the source tables, process them, 
    # and write the cleaned data to the warehouse.
    write_to_wh(process_district(pd.read_sql("SELECT * FROM district", src_engine)), "district")
    write_to_wh(process_account(pd.read_sql("SELECT * FROM account", src_engine)), "account")
    write_to_wh(make_period(), "period")
    write_to_wh(make_type(), "type")

    # Read the warehouse tables to get the generated primary keys for accounts and districts.
    wh_accounts = pd.read_sql("SELECT sys_account_ID, account_ID FROM account", wh_engine)
    wh_districts = pd.read_sql("SELECT sys_district_id, district_id FROM district", wh_engine)
    src_accounts = pd.read_sql("SELECT account_id AS account_ID, district_id FROM account", src_engine)
    
    # Connect each source account and district to their warehouse-generated IDs.
    lookup = src_accounts.merge(wh_accounts, on="account_ID").merge(wh_districts, on="district_id")
    lookup = lookup[["account_ID", "sys_account_ID", "sys_district_id"]]

    # Read the warehouse type table to get the generated primary keys for transaction types.
    wh_types = pd.read_sql("SELECT type_id, action_done, transaction_type, k_symbol FROM type", wh_engine)
    for c in ["action_done", "transaction_type", "k_symbol"]:
        wh_types[c] = wh_types[c].fillna("N/A")

    # Read the warehouse period table to get the generated primary keys for each date.
    wh_periods = pd.read_sql("SELECT period_id, complete_date FROM period", wh_engine)
    wh_periods["complete_date"] = pd.to_datetime(wh_periods["complete_date"])

    # The same account, period, and type combination can appear in more than one chunk,
    # so each chunk is only summarized into partial totals here.
    # The partial totals are kept in memory and combined after all chunks are processed.
    total = 0
    partials = []
    for chunk in read_source("trans"):
        total += len(chunk)
        partials.append(build_fact(chunk, lookup, wh_types, wh_periods))

    # Add up the partial totals for each combination of foreign keys,
    # so that every combination ends up as exactly one row in the fact table.
    fk_cols = ["sys_account_ID", "sys_district_id", "period_id", "type_id"]
    fact = pd.concat(partials, ignore_index=True)
    fact = fact.groupby(fk_cols, as_index=False)[["num_of_transactions", "total_trans_amount"]].sum()

    # Round the total amount to two decimals to match the DECIMAL(15,2) column
    # and remove any floating-point noise from the additions.
    fact["total_trans_amount"] = fact["total_trans_amount"].round(2)
    write_to_wh(fact, "trans")
    log.info(f"ETL Complete. Processed {total} transaction rows into {len(fact)} aggregated fact rows.")

# This function executes a SQL query that is expected to return a single value,
# such as a count or sum, and returns that value.
def get_single_val(engine, query):
    with engine.connect() as conn:
        return conn.execute(text(query)).scalar()

# This function validates the data in the warehouse by comparing it to the source data.
def execute_validate():
    # Compare row counts for the source tables that are copied one-to-one into the warehouse.
    for t in ["account", "district"]:
        s_count = get_single_val(src_engine, f"SELECT COUNT(*) FROM {t}")
        w_count = get_single_val(wh_engine, f"SELECT COUNT(*) FROM {t}")
        status = "OK" if s_count == w_count else "MISMATCH"
        log.info(f"{t}: source={s_count} warehouse={w_count} {status}")

    # The fact table is aggregated, so its row count is not expected to equal the source's.
    # Instead, the total of num_of_transactions must equal the number of source transactions.
    s_count = get_single_val(src_engine, "SELECT COUNT(*) FROM trans")
    w_count = get_single_val(wh_engine, "SELECT SUM(num_of_transactions) FROM trans")
    status = "OK" if s_count == w_count else "MISMATCH"
    log.info(f"trans: source rows={s_count} warehouse num_of_transactions total={w_count} {status}")

    # Compare the total transaction amount between the source and warehouse.
    s_sum = float(get_single_val(src_engine, "SELECT ROUND(SUM(amount), 1) FROM trans"))
    w_sum = float(get_single_val(wh_engine, "SELECT ROUND(SUM(total_trans_amount), 1) FROM trans"))
    status = "OK" if s_sum == w_sum else "MISMATCH"
    log.info(f"SUM(amount): source={s_sum} warehouse={w_sum} {status}")

    # Check for duplicate rows in the warehouse fact table, where a row is identified by its four foreign keys.
    dups = get_single_val(wh_engine, "SELECT COUNT(*) - COUNT(DISTINCT sys_account_ID, sys_district_id, period_id, type_id) FROM trans")
    log.info(f"Duplicate fact rows: {dups}")

    # Check that every foreign key in the fact table points to an existing dimension row.
    fk_checks = [("account", "sys_account_ID"), ("district", "sys_district_id"), 
                 ("period", "period_id"), ("type", "type_id")]
    for tbl, key in fk_checks:
        q = f"SELECT COUNT(*) FROM trans f LEFT JOIN {tbl} d ON f.{key} = d.{key} WHERE d.{key} IS NULL"
        orphans = get_single_val(wh_engine, q)
        log.info(f"Orphan {key}: {orphans}")

    # Check for any null values in the fact table's num_of_transactions or total_trans_amount columns.
    null_q = "SELECT SUM(num_of_transactions IS NULL) AS a, SUM(total_trans_amount IS NULL) AS b FROM trans"
    nulls = pd.read_sql(null_q, wh_engine)
    print(nulls.to_string(index=False))

    # Store the names of checks that fail, so the script can report them at the end.
    failures = []

    # This inner function checks whether the actual value from the warehouse matches 
    # the expected value from the source, allowing for a small tolerance in numeric comparisons.
    def check(name, actual, expected, tol=0.0):
        # A check passes when the difference is within the allowed tolerance.
        ok = abs(float(actual) - float(expected)) <= tol
        log.info(f"{name}: warehouse={actual} expected={expected} {'OK' if ok else 'MISMATCH'}")
        if not ok:
            failures.append(name)

    # This inner function retrieves a single row from the database,
    # which is useful for getting counts and sums for validation.
    def get_row(engine, query):
        with engine.connect() as conn:
            return conn.execute(text(query)).one()

    # Perform specific checks on the period and type dimension tables,
    # as well as on the number of credit and debit transactions and their total amounts.
    check("period rows", get_single_val(wh_engine, "SELECT COUNT(*) FROM period"), 2191)

    # Check that the number of unique transaction types in the warehouse matches the source.
    expected_types = get_single_val(src_engine,
        "SELECT COUNT(*) FROM (SELECT DISTINCT IF(type = 'VYBER', 'Debit (Withdrawal)', type), "
        "IFNULL(NULLIF(operation, ''), 'N/A'), IFNULL(NULLIF(k_symbol, ''), 'N/A') FROM trans) x")
    check("type rows", get_single_val(wh_engine, "SELECT COUNT(*) FROM type"), expected_types)

    # Check that the number of fact rows equals the number of distinct account, date, and type
    # combinations in the source, which is what the aggregation is supposed to produce.
    expected_fact_rows = get_single_val(src_engine,
        "SELECT COUNT(*) FROM (SELECT DISTINCT account_id, newdate, IF(type = 'VYBER', 'Debit (Withdrawal)', type), "
        "IFNULL(NULLIF(operation, ''), 'N/A'), IFNULL(NULLIF(k_symbol, ''), 'N/A') FROM trans) x")
    check("fact rows", get_single_val(wh_engine, "SELECT COUNT(*) FROM trans"), expected_fact_rows)

    # Check that the number of credit and debit transactions and their total amounts 
    # match between the source and warehouse.
    groups = [("CREDIT", "type = 'Credit'"),
              ("DEBIT", "type IN ('Debit (Withdrawal)', 'VYBER')")]
    for label, src_filter in groups:
        s_n, s_amt = get_row(src_engine, f"SELECT COUNT(*), SUM(amount) FROM trans WHERE {src_filter}")
        w_n, w_amt = get_row(wh_engine,
            "SELECT SUM(f.num_of_transactions), SUM(f.total_trans_amount) FROM trans f "
            "JOIN type t ON f.type_id = t.type_id "
            f"WHERE t.transaction_type = '{label}'")
        check(f"{label} transactions", w_n, s_n)
        check(f"{label} amount", w_amt, s_amt, tol=0.05)

    # Check that there are no remaining VYBER transaction types in the warehouse.
    check("VYBER types left", get_single_val(wh_engine,
        "SELECT COUNT(*) FROM type WHERE transaction_type = 'VYBER'"), 0)

    # Finally, if any of the checks failed, log an error message and exit with a non-zero status code.
    if failures:
        log.error(f"VALIDATION FAILED: {', '.join(failures)}")
        sys.exit(1)
    log.info("All checks passed")


# This block allows the script to be run from the command line with different actions. 
# This is mainly for testing purposes.
if __name__ == "__main__":
    # The first command-line argument tells the script what action to perform.
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(0)
        
    action = sys.argv[1]
    if action == "profile" and len(sys.argv) > 2:
        profile_table(sys.argv[2])
    elif action == "run":
        execute_run()
    elif action == "validate":
        execute_validate()
    else:
        print("Invalid command. Use 'profile', 'run', or 'validate'.")