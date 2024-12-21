import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq, and, sql } from 'drizzle-orm'
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

recipe.use('*', authMiddleware)

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
        duration: recipes.duration,
        servings: recipes.servings,
        userId: recipes.userId,
        imageUrl: recipes.imageUrl
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
      isFavorite: sql<boolean>`${userFavorites.userId} IS NOT NULL`
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
        id: users.id,
        firstName: users.firstName,
      },
      isFavorite: sql<boolean>`${userFavorites.userId} IS NOT NULL`
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

    const key = `${id}-${Date.now()}`
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
          imageUrl: `/images/${key}`
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