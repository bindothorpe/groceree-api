import { sql } from "drizzle-orm"
import { 
  integer, 
  sqliteTable, 
  text, 
  real,
  unique 
} from "drizzle-orm/sqlite-core"

// Users table
export const users = sqliteTable('users', {
  id: text('id').primaryKey().default(sql`(lower(hex(randomblob(16))))`),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  username: text('username').notNull().unique(),
  password: text('password').notNull(), // In production, ensure this is properly hashed
  imageUrl: text('image_url').notNull(), // Default to empty string
  bio: text('bio').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`)
})

// Recipes table
export const recipes = sqliteTable('recipes', {
  id: text('id').primaryKey().default(sql`(lower(hex(randomblob(16))))`),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  imageUrl: text('image_url').notNull(),
  duration: integer('duration').notNull(),
  servings: integer('servings').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`)
})


// Ingredients table
export const ingredients = sqliteTable('ingredients', {
  id: text('id').primaryKey().default(sql`(lower(hex(randomblob(16))))`),
  recipeId: text('recipe_id')
    .notNull()
    .references(() => recipes.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  amount: real('amount').notNull(),
  unit: text('unit').notNull(),
})

// Instructions table
export const instructions = sqliteTable('instructions', {
  id: text('id').primaryKey().default(sql`(lower(hex(randomblob(16))))`),
  recipeId: text('recipe_id')
    .notNull()
    .references(() => recipes.id, { onDelete: 'cascade' }),
  step: integer('step').notNull(),
  instruction: text('instruction').notNull(),
})

// User favorites table (many-to-many relationship)
export const userFavorites = sqliteTable('user_favorites', {
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  recipeId: text('recipe_id')
    .notNull()
    .references(() => recipes.id, { onDelete: 'cascade' }),
}, (table) => ({
  pk: unique().on(table.userId, table.recipeId),
}))