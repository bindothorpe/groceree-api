import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { users } from '../db/schema'
import { RegisterUserRequest, LoginRequest, AuthUser } from '../models/types'

const auth = new Hono<{ Bindings: Env }>()

// Simple JWT secret (in production, use env variables)
const JWT_SECRET = 'your-secret-key'

auth.post('/register', async (c) => {
  const body = await c.req.json<RegisterUserRequest>()
  const db = drizzle(c.env.DB)

  try {
    // Check if username exists
    const existingUser = await db.select()
      .from(users)
      .where(eq(users.username, body.username))
      .get()

    if (existingUser) {
      return c.json({ error: 'Username already exists' }, 400)
    }

    // Create user
    const [user] = await db.insert(users)
      .values({
        firstName: body.firstName,
        lastName: body.lastName,
        username: body.username,
        password: body.password, // In production, hash this!
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
    return c.json({ error: 'Failed to create user' }, 500)
  }
})

auth.post('/login', async (c) => {
  const body = await c.req.json<LoginRequest>()
  const db = drizzle(c.env.DB)

  try {
    const user = await db.select({
      id: users.id,
      username: users.username,
      password: users.password,
    })
    .from(users)
    .where(eq(users.username, body.username))
    .get()

    if (!user || user.password !== body.password) { // In production, use proper password comparison
      return c.json({ error: 'Invalid credentials' }, 401)
    }

    const token = await generateToken({
      id: user.id,
      username: user.username,
    })

    return c.json({ token })
  } catch (error) {
    return c.json({ error: 'Login failed' }, 500)
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
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const token = authHeader.split(' ')[1]
  try {
    // In production, use proper JWT verification
    const decoded = JSON.parse(atob(token)) as AuthUser
    c.set('user', decoded)
    await next()
  } catch {
    return c.json({ error: 'Invalid token' }, 401)
  }
}

export default auth