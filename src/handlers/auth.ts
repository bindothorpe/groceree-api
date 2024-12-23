import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { users } from '../db/schema'
import { RegisterUserRequest, LoginRequest, AuthUser } from '../models/types'
import { ApiError } from '../middleware/errorHandler'

const auth = new Hono<{ Bindings: Env }>()

// Simple JWT secret (in production, use env variables)
const JWT_SECRET = 'your-secret-key'

function normalizeUsername(username: string): string {
  return username.toLowerCase().trim()
}

auth.post('/register', async (c) => {
  const db = drizzle(c.env.DB)

  try {
    const body = await c.req.json<RegisterUserRequest>()
    const normalizedUsername = normalizeUsername(body.username)

    // Check if username exists
    const existingUser = await db.select()
      .from(users)
      .where(eq(users.username, normalizedUsername))
      .get()

    if (existingUser) {
      throw new ApiError(400, 'Username already exists')
    }

    // Create user
    const [user] = await db.insert(users)
      .values({
        firstName: body.firstName,
        lastName: body.lastName,
        username: normalizedUsername,
        password: body.password,
        imageUrl: "",
        bio: "Hi, I'm new here!",
      })
      .returning({
        id: users.id,
        username: users.username,
      })

    // Generate JWT token
    const token = await generateToken(user)

    return c.json({ token })
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(500, 'Failed to create user', error as Error)
  }
})

// Check username availability
auth.get("/check-username/:username", async (c) => {
  const username = normalizeUsername(c.req.param("username"))
  const db = drizzle(c.env.DB)

  try {
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .get()

    if (existingUser) {
      return c.json({
        available: false,
        username: username,
        message: 'Username is already taken'
      }, 409)
    }

    return c.json({
      available: true,
      username: username,
      message: 'Username is available'
    }, 200)
  } catch (error) {
    throw new ApiError(500, 'Failed to check username availability', error as Error)
  }
})

auth.post('/login', async (c) => {
  const db = drizzle(c.env.DB)

  try {
    const body = await c.req.json<LoginRequest>()
    const normalizedUsername = normalizeUsername(body.username)

    const user = await db.select({
      id: users.id,
      username: users.username,
      password: users.password,
    })
    .from(users)
    .where(eq(users.username, normalizedUsername))
    .get()

    if (!user || user.password !== body.password) {
      throw new ApiError(401, 'Invalid credentials')
    }

    const token = await generateToken({
      id: user.id,
      username: user.username,
    })

    return c.json({ token })
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(500, 'Login failed', error as Error)
  }
})

// Helper function to generate JWT token
async function generateToken(user: AuthUser): Promise<string> {
  // In production, use proper JWT library
  return btoa(JSON.stringify(user))
}

// Middleware to verify JWT token
export async function authMiddleware(c: any, next: () => Promise<void>) {
  const authHeader = c.req.header('Authorization')
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new ApiError(401, 'Unauthorized')
  }

  try {
    const token = authHeader.split(' ')[1]
    // In production, use proper JWT verification
    const decoded = JSON.parse(atob(token)) as AuthUser
    c.set('user', decoded)
    await next()
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(401, 'Invalid token', error as Error)
  }
}

export default auth