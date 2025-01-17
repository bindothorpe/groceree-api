// Add to your handlers/users.ts or create if it doesn't exist
import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { users } from '../db/schema'
import { ApiError } from '../middleware/errorHandler'
import { authMiddleware } from './auth'

const user = new Hono<{ Bindings: Env; Variables: Variables }>()

user.use('*', authMiddleware)

// Get current user details
user.get('/me', async (c) => {
  const currentUser = c.get('user')
  const db = drizzle(c.env.DB)

  try {
    const userDetails = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        username: users.username,
        imageUrl: users.imageUrl,
        bio: users.bio,
      })
      .from(users)
      .where(eq(users.id, currentUser.id))
      .get()

    if (!userDetails) {
      throw new ApiError(404, 'User not found')
    }

    return c.json({ user: userDetails })
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(500, 'Failed to fetch user details', error as Error)
  }
})

// Get user details
user.get('/:username', async (c) => {
  const username = c.req.param('username')
  const db = drizzle(c.env.DB)

  try {
    const userDetails = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        username: users.username,
        imageUrl: users.imageUrl,
        bio: users.bio,
      })
      .from(users)
      .where(eq(users.username, username))
      .get()

    if (!userDetails) {
      throw new ApiError(404, 'User not found')
    }

    return c.json({ user: userDetails })
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(500, 'Failed to fetch user details', error as Error)
  }
})


// Update user profile
user.put('/', async (c) => {
  const currentUser = c.get('user')
    const db = drizzle(c.env.DB)
    try {
      const body = await c.req.json<{
        firstName: string
        lastName: string
        bio: string
      }>()
  
      const [updatedUser] = await db
        .update(users)
        .set({
          firstName: body.firstName,
          lastName: body.lastName,
          bio: body.bio,
        })
        .where(eq(users.id, currentUser.id))
        .returning({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          username: users.username,
          imageUrl: users.imageUrl,
          bio: users.bio,
        })
  
      if (!updatedUser) {
        throw new ApiError(404, 'User not found')
      }
  
      return c.json({ user: updatedUser })
    } catch (error) {
      if (error instanceof ApiError) throw error
      throw new ApiError(500, 'Failed to update user profile', error as Error)
    }
  })

  // Update profile image
user.post('/image', async (c) => {
    const currentUser = c.get('user')
    const db = drizzle(c.env.DB)
  
    try {
      // Validate request content type
      const contentType = c.req.header('content-type')
      if (!contentType?.includes('multipart/form-data')) {
        throw new ApiError(400, 'Content type must be multipart/form-data')
      }
  
      const formData = await c.req.formData()
      const image = formData.get('image')
  
      if (!image || !(image instanceof File)) {
        throw new ApiError(400, 'No image provided')
      }
  
      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif']
      if (!allowedTypes.includes(image.type)) {
        throw new ApiError(400, 'Invalid image type. Allowed types: JPG, PNG, GIF')
      }
  
      // Check file size (5MB limit)
      if (image.size > 5 * 1024 * 1024) {
        throw new ApiError(400, 'Image too large. Maximum size is 5MB')
      }
  
      // Upload to R2
      const key = `images/users/${currentUser.username}-${Date.now()}`
      await c.env.groceree_r2.put(key, image, {
        httpMetadata: {
          contentType: image.type,
        }
      })
  
      // Delete old image if exists
      const user = await db.select({
        imageUrl: users.imageUrl
      })
      .from(users)
      .where(eq(users.username, currentUser.username))
      .get()
  
      if (user?.imageUrl) {
        try {
          await c.env.groceree_r2.delete(user.imageUrl)
        } catch (error) {
          console.error('Failed to delete old image:', error)
        }
      }
  
      // Update user with new image URL
      const [updatedUser] = await db
        .update(users)
        .set({
          imageUrl: `/${key}`
        })
        .where(eq(users.username, currentUser.username))
        .returning({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          username: users.username,
          imageUrl: users.imageUrl,
          bio: users.bio,
        })
  
      return c.json({ 
        success: true,
        user: updatedUser
      })
    } catch (error) {
      if (error instanceof ApiError) throw error
      throw new ApiError(500, 'Failed to update profile image', error as Error)
    }
  })

export default user