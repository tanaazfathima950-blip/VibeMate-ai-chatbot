# db.py - VibeMate 2.0 database helper (MySQL)

import os

import mysql.connector
from dotenv import load_dotenv
from mysql.connector import Error

# Read the database settings from the .env file
load_dotenv()

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "port": int(os.getenv("DB_PORT", "3306")),
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD"),
    "database": os.getenv("DB_NAME", "vibemate"),
    "charset": "utf8mb4",
    "collation": "utf8mb4_unicode_ci",
}


def get_connection():
    """Open a new connection to the MySQL database."""
    return mysql.connector.connect(**DB_CONFIG)


def fetch_all(sql, params=None):
    """
    Run a SELECT query and return all rows as a list of dictionaries.
    Always pass user values in 'params' (never build the SQL text with them).
    """
    connection = get_connection()
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(sql, params or ())
        rows = cursor.fetchall()
        cursor.close()
        return rows
    finally:
        connection.close()


def fetch_one(sql, params=None):
    """Run a SELECT query and return the first row (or None)."""
    rows = fetch_all(sql, params)
    return rows[0] if rows else None


def execute(sql, params=None):
    """
    Run an INSERT, UPDATE or DELETE query and save the change.
    Returns the id of the new row (for INSERT queries).
    """
    connection = get_connection()
    try:
        cursor = connection.cursor()
        cursor.execute(sql, params or ())
        connection.commit()
        new_id = cursor.lastrowid
        cursor.close()
        return new_id
    finally:
        connection.close()


# ---------------------------------------------------------
# Test: run  python db.py  to check the connection
# ---------------------------------------------------------
if __name__ == "__main__":
    if not DB_CONFIG["user"] or not DB_CONFIG["password"]:
        print("DB_USER or DB_PASSWORD is missing in the .env file.")
    else:
        try:
            version = fetch_one("SELECT VERSION() AS version")["version"]
            tables = [list(row.values())[0] for row in fetch_all("SHOW TABLES")]
            print("Connected to MySQL", version)
            print("Tables found:", tables)
        except Error as error:
            print("Connection failed:", error)