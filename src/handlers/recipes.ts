import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq, and, sql, is } from 'drizzle-orm'
import { recipes, ingredients, instructions, userFavorites, users } from '../db/schema'
import { CreateRecipeRequest, Recipe, RecipeListItem } from '../models/types'
import { authMiddleware } from './auth'
import { ApiError } from '../middleware/errorHandler'

interface Variables {
  user: {
    id: string
    username: string
  }
}

const recipe = new Hono<{ Bindings: Env; Variables: Variables }>()

// Require authentication for all routes
recipe.use('*', authMiddleware)

// Create a new recipe
recipe.post('/', async (c) => {
  const body = await c.req.json<CreateRecipeRequest>()
  const user = c.get('user')
  const db = drizzle(c.env.DB)

  try {
    const [newRecipe] = await db.insert(recipes)
      .values({
        name: body.name,
        duration: body.duration,
        servings: body.servings,
        userId: user.id,
        imageUrl: '' // TODO: Add a default image
      })
      .returning({
        id: recipes.id,
        name: recipes.name,
        imageUrl: recipes.imageUrl,
        duration: recipes.duration,
        isFavorite: sql<boolean>`false`
      })

    if (body.ingredients.length > 0) {
      await db.insert(ingredients)
        .values(body.ingredients.map(ing => ({
          recipeId: newRecipe.id,
          name: ing.name,
          amount: ing.amount,
          unit: ing.unit,
        })))
    }

    if (body.instructions.length > 0) {
      await db.insert(instructions)
        .values(body.instructions.map(inst => ({
          recipeId: newRecipe.id,
          step: inst.step,
          instruction: inst.instruction,
        })))
    }

    return c.json({ recipe: newRecipe }, 201)
  } catch (error) {
    console.error('Create recipe error:', error)
    throw new ApiError(500, 'Failed to create recipe', error as Error)
  }
})


// Get all recipes
recipe.get('/', async (c) => {
  const user = c.get('user')
  const search = c.req.query('search')
  const db = drizzle(c.env.DB)

  try {
    const baseQuery = db.select({
      id: recipes.id,
      name: recipes.name,
      imageUrl: recipes.imageUrl,
      duration: recipes.duration,
      isFavorite: sql`CASE WHEN ${userFavorites.userId} IS NOT NULL THEN true ELSE false END`
    })
    .from(recipes)
    .leftJoin(userFavorites, and(
      eq(recipes.id, userFavorites.recipeId),
      eq(userFavorites.userId, user.id)
    ))

    const recipeList = await (search 
      ? baseQuery.where(sql`${recipes.name} LIKE ${'%' + search + '%'}`)
      : baseQuery).all()
    
    return c.json({ recipes: recipeList })
  } catch (error) {
    throw new ApiError(500, 'Failed to fetch recipes', error as Error)
  }
})

// Get current user's recipes
recipe.get('/user/me', async (c) => {
  const user = c.get('user')
  const db = drizzle(c.env.DB)

  try {
    const userRecipes = await db
      .select({
        id: recipes.id,
        name: recipes.name,
        imageUrl: recipes.imageUrl,
        duration: recipes.duration,
        author: {
          id: users.username,
          firstName: users.firstName,
        },
        isFavorite: sql`CASE WHEN ${userFavorites.userId} IS NOT NULL THEN true ELSE false END`
      })
      .from(recipes)
      .innerJoin(users, eq(recipes.userId, users.id))
      .leftJoin(userFavorites, and(
        eq(recipes.id, userFavorites.recipeId),
        eq(userFavorites.userId, user.id)
      ))
      .where(eq(recipes.userId, user.id))
      .all()

    return c.json({ recipes: userRecipes })
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(500, 'Failed to fetch user recipes', error as Error)
  }
})

// Get current user's liked recipes
recipe.get('/favorites/me', async (c) => {
  const user = c.get('user')
  const db = drizzle(c.env.DB)

  try {
    const favoriteRecipes = await db
      .select({
        id: recipes.id,
        name: recipes.name,
        imageUrl: recipes.imageUrl,
        duration: recipes.duration,
        isFavorite: sql`CASE WHEN ${userFavorites.userId} IS NOT NULL THEN true ELSE false END`,
        author: {
          id: users.username,
          firstName: users.firstName,
        }
      })
      .from(recipes)
      .innerJoin(userFavorites, and(
        eq(recipes.id, userFavorites.recipeId),
        eq(userFavorites.userId, user.id)
      ))
      .innerJoin(users, eq(recipes.userId, users.id))
      .all()

    return c.json({ recipes: favoriteRecipes })
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(500, 'Failed to fetch favorite recipes', error as Error)
  }
})

// Get single recipe
recipe.get('/:id', async (c) => {
  const id = c.req.param('id')
  const user = c.get('user')
  const db = drizzle(c.env.DB)

  try {
    const recipe = await db.select({
      id: recipes.id,
      name: recipes.name,
      imageUrl: recipes.imageUrl,
      duration: recipes.duration,
      servings: recipes.servings,
      author: {
        id: users.username,
        firstName: users.firstName,
      },
      isFavorite: sql`CASE WHEN ${userFavorites.userId} IS NOT NULL THEN true ELSE false END`
    })
    .from(recipes)
    .leftJoin(userFavorites, and(
      eq(recipes.id, userFavorites.recipeId),
      eq(userFavorites.userId, user.id)
    ))
    .leftJoin(users, eq(recipes.userId, users.id))
    .where(eq(recipes.id, id))
    .get()

    if (!recipe) {
      throw new ApiError(404, 'Recipe not found')
    }

    const recipeIngredients = await db.select({
      id: ingredients.id,
      name: ingredients.name,
      amount: ingredients.amount,
      unit: ingredients.unit
    })
    .from(ingredients)
    .where(eq(ingredients.recipeId, id))
    .all()

    const recipeInstructions = await db.select({
      id: instructions.id,
      step: instructions.step,
      instruction: instructions.instruction
    })
    .from(instructions)
    .where(eq(instructions.recipeId, id))
    .orderBy(instructions.step)
    .all()

    return c.json({
      recipe: {
        ...recipe,
        ingredients: recipeIngredients,
        instructions: recipeInstructions,
      }
    })
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(500, 'Failed to fetch recipe', error as Error)
  }
})

// Get user's favorite recipes by username
recipe.get('/favorites/:username', async (c) => {
  const username = c.req.param('username')
  const db = drizzle(c.env.DB)

  try {
    const favoriteRecipes = await db
      .select({
        id: recipes.id,
        name: recipes.name,
        imageUrl: recipes.imageUrl,
        duration: recipes.duration,
        isFavorite: sql<boolean>`true`, // Since we're only getting favorites
        author: {
          id: users.username,
          firstName: users.firstName,
        }
      })
      .from(recipes)
      .innerJoin(userFavorites, eq(recipes.id, userFavorites.recipeId))
      .innerJoin(users, and(
        eq(recipes.userId, users.id),
        eq(users.username, username)
      ))
      .where(eq(userFavorites.userId, users.id))  // Use the joined user's ID
      .all()

    if (!favoriteRecipes || favoriteRecipes.length === 0) {
      return c.json({ recipes: [] })
    }

    return c.json({ recipes: favoriteRecipes })
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(500, 'Failed to fetch favorite recipes', error as Error)
  }
})

// Get all recipes from a specific user
recipe.get('/user/:username', async (c) => {
  const username = c.req.param('username')
  const currentUser = c.get('user') // Get current authenticated user for isFavorite check
  const db = drizzle(c.env.DB)

  try {
    const userRecipes = await db
      .select({
        id: recipes.id,
        name: recipes.name,
        imageUrl: recipes.imageUrl,
        duration: recipes.duration,
        author: {
          id: users.username,
          firstName: users.firstName,
        },
        isFavorite: sql`CASE WHEN ${userFavorites.userId} IS NOT NULL THEN true ELSE false END`
      })
      .from(recipes)
      .innerJoin(users, and(
        eq(recipes.userId, users.id),
        eq(users.username, username)
      ))
      .leftJoin(userFavorites, and(
        eq(recipes.id, userFavorites.recipeId),
        eq(userFavorites.userId, currentUser.id)
      ))
      .all()

    if (!userRecipes || userRecipes.length === 0) {
      return c.json({ recipes: [] })
    }

    return c.json({ recipes: userRecipes })
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(500, 'Failed to fetch user recipes', error as Error)
  }
})

// Toggle favorite
recipe.post('/:id/favorite', async (c) => {
  const id = c.req.param('id')
  const user = c.get('user')
  const db = drizzle(c.env.DB)

  try {
    const recipe = await db.select().from(recipes).where(eq(recipes.id, id)).get()
    if (!recipe) {
      throw new ApiError(404, 'Recipe not found')
    }

    const favorite = await db.select()
      .from(userFavorites)
      .where(and(
        eq(userFavorites.recipeId, id),
        eq(userFavorites.userId, user.id)
      ))
      .get()

    if (favorite) {
      await db.delete(userFavorites)
        .where(and(
          eq(userFavorites.recipeId, id),
          eq(userFavorites.userId, user.id)
        ))
    } else {
      await db.insert(userFavorites)
        .values({
          userId: user.id,
          recipeId: id,
        })
    }

    return c.json({ success: true })
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(500, 'Failed to toggle favorite', error as Error)
  }
})

// Update recipe
recipe.put('/:id', async (c) => {
  const id = c.req.param('id')
  const user = c.get('user')
  const body = await c.req.json<CreateRecipeRequest>()
  const db = drizzle(c.env.DB)

  try {
    // Check if recipe exists and user is the owner
    const existingRecipe = await db.select()
      .from(recipes)
      .where(and(
        eq(recipes.id, id),
        eq(recipes.userId, user.id)
      ))
      .get()

    if (!existingRecipe) {
      throw new ApiError(404, 'Recipe not found or you do not have permission to update it')
    }

    // Update recipe
    const [updatedRecipe] = await db.update(recipes)
      .set({
        name: body.name,
        duration: body.duration,
        servings: body.servings,
      })
      .where(eq(recipes.id, id))
      .returning()

    // Delete existing ingredients
    await db.delete(ingredients)
      .where(eq(ingredients.recipeId, id))

    // Add new ingredients
    if (body.ingredients.length > 0) {
      await db.insert(ingredients)
        .values(body.ingredients.map(ing => ({
          recipeId: id,
          name: ing.name,
          amount: ing.amount,
          unit: ing.unit,
        })))
    }

    // Delete existing instructions
    await db.delete(instructions)
      .where(eq(instructions.recipeId, id))

    // Add new instructions
    if (body.instructions.length > 0) {
      await db.insert(instructions)
        .values(body.instructions.map(inst => ({
          recipeId: id,
          step: inst.step,
          instruction: inst.instruction,
        })))
    }

    return c.json({
      recipe: {
        id: updatedRecipe.id,
        name: updatedRecipe.name,
        imageUrl: updatedRecipe.imageUrl,
        duration: updatedRecipe.duration,
        isFavorite: false

      }
    })
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(500, 'Failed to update recipe', error as Error)
  }
})

// Delete recipe
recipe.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const user = c.get('user')
  const db = drizzle(c.env.DB)

  try {
    // Check if recipe exists and user is the owner
    const recipeToDelete = await db.select()
      .from(recipes)
      .where(and(
        eq(recipes.id, id),
        eq(recipes.userId, user.id)
      ))
      .get()

    if (!recipeToDelete) {
      throw new ApiError(404, 'Recipe not found or you do not have permission to delete it')
    }

    // Delete recipe (cascade will handle related records)
    await db.delete(recipes)
      .where(eq(recipes.id, id))

    // If recipe had an image, delete it from R2
    if (recipeToDelete.imageUrl) {
      const key = recipeToDelete.imageUrl.replace('/images/', '')
      try {
        await c.env.groceree_r2.delete(key)
      } catch (error) {
        console.error('Failed to delete image from R2:', error)
      }
    }

    return c.json({ success: true })
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(500, 'Failed to delete recipe', error as Error)
  }
})


// Upload recipe image
recipe.post('/:id/image', async (c) => {
  const id = c.req.param('id')
  const db = drizzle(c.env.DB)

  try {
    const recipe = await db.select().from(recipes).where(eq(recipes.id, id)).get()
    if (!recipe) {
      throw new ApiError(404, 'Recipe not found')
    }

    const contentType = c.req.header('content-type')
    if (!contentType?.includes('multipart/form-data')) {
      throw new ApiError(400, 'Content type must be multipart/form-data')
    }

    let formData: FormData
    try {
      formData = await c.req.formData()
    } catch (error) {
      console.error('Form data parse error:', error)
      throw new ApiError(400, 'Invalid form data')
    }

    const image = formData.get('image')
    if (!image) {
      throw new ApiError(400, 'No image provided')
    }

    if (!(image instanceof File)) {
      throw new ApiError(400, 'Invalid image format')
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif']
    if (!allowedTypes.includes(image.type)) {
      throw new ApiError(400, 'Invalid image type. Allowed types: JPG, PNG, GIF')
    }

    if (image.size > 5 * 1024 * 1024) {
      throw new ApiError(400, 'Image too large. Maximum size is 5MB')
    }

    const key = `images/recipes/${id}-${Date.now()}`
    try {
      await c.env.groceree_r2.put(key, image, {
        httpMetadata: {
          contentType: image.type,
        }
      })
    } catch (error) {
      console.error('R2 upload error:', error)
      throw new ApiError(500, 'Failed to upload image to storage')
    }

    try {
      const [updatedRecipe] = await db
        .update(recipes)
        .set({ 
          imageUrl: `/${key}`
        })
        .where(eq(recipes.id, id))
        .returning({
          imageUrl: recipes.imageUrl
        })

      return c.json({ 
        success: true, 
        imageUrl: updatedRecipe.imageUrl 
      })
    } catch (error) {
      try {
        await c.env.groceree_r2.delete(key)
      } catch (deleteError) {
        console.error('Failed to delete uploaded image after db error:', deleteError)
      }
      throw new ApiError(500, 'Failed to update recipe with image URL')
    }
  } catch (error) {
    if (error instanceof ApiError) throw error
    console.error('Unexpected error:', error)
    throw new ApiError(500, 'Failed to upload image', error as Error)
  }
})

export default recipe