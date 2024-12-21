-- Migration: Initial schema
-- Create Users table
CREATE TABLE users (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  image_url TEXT,
  bio TEXT DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- Create Recipes table
CREATE TABLE recipes (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  image_url TEXT NOT NULL,
  duration INTEGER NOT NULL,
  servings INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- Create Ingredients table
CREATE TABLE ingredients (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount REAL NOT NULL,
  unit TEXT NOT NULL
);

-- Create Instructions table
CREATE TABLE instructions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  step INTEGER NOT NULL,
  instruction TEXT NOT NULL
);

-- Create UserFavorites table
CREATE TABLE user_favorites (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, recipe_id)
);