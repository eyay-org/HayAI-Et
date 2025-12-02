"""
MongoDB Database Connection and Collections
"""
import os
from pymongo import MongoClient
from pymongo.database import Database
from pymongo.collection import Collection
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

# MongoDB connection
MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
DATABASE_NAME = os.getenv("DATABASE_NAME", "hayai_db")

# Global client and database instances
_client: Optional[MongoClient] = None
_db: Optional[Database] = None


def get_client() -> MongoClient:
    """Get or create MongoDB client"""
    global _client
    if _client is None:
        _client = MongoClient(MONGODB_URI)
    return _client


def get_database() -> Database:
    """Get or create database instance"""
    global _db
    if _db is None:
        client = get_client()
        _db = client[DATABASE_NAME]
    return _db


def get_users_collection() -> Collection:
    """Get users collection"""
    return get_database()["users"]


def get_posts_collection() -> Collection:
    """Get posts collection"""
    return get_database()["posts"]


def get_follows_collection() -> Collection:
    """Get follows collection"""
    return get_database()["follows"]


def get_counters_collection() -> Collection:
    """Get counters collection for auto-increment IDs"""
    return get_database()["counters"]


def get_audit_logs_collection() -> Collection:
    """Get audit logs collection"""
    return get_database()["audit_logs"]


def get_next_sequence(name: str) -> int:
    """Get next auto-increment ID for a collection"""
    counters = get_counters_collection()
    result = counters.find_one_and_update(
        {"_id": name},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True
    )
    return result["seq"]


def init_database():
    """Initialize database with indexes and default data"""
    db = get_database()
    
    # Create indexes
    users = get_users_collection()
    users.create_index("username", unique=True)
    users.create_index("email", unique=True)
    
    posts = get_posts_collection()
    posts.create_index("user_id")
    posts.create_index("image_id", unique=True)
    posts.create_index("created_at")
    
    follows = get_follows_collection()
    follows.create_index([("follower_id", 1), ("following_id", 1)], unique=True)
    follows.create_index("follower_id")
    follows.create_index("following_id")

    # Audit Logs index
    audit_logs = get_audit_logs_collection()
    audit_logs.create_index("timestamp")
    audit_logs.create_index("actor_id")
    
    # Initialize counter if not exists
    counters = get_counters_collection()
    if counters.find_one({"_id": "user_id"}) is None:
        # Start from 10 to avoid conflicts with default users
        counters.insert_one({"_id": "user_id", "seq": 10})
    
    print("✅ Database initialized successfully")


def close_connection():
    """Close MongoDB connection"""
    global _client, _db
    if _client:
        _client.close()
        _client = None
        _db = None

