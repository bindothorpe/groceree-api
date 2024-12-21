import { Hono } from 'hono'
import { cors } from 'hono/cors'
import auth from './handlers/auth'
import recipe from './handlers/recipes'
import { ApiError, errorHandler } from './middleware/errorHandler'
import user from 'handlers/users'

const app = new Hono<{ Bindings: Env }>()

// Add CORS middleware
app.use('/*', cors())

// Add error handling
app.onError(errorHandler)

// Mount routes
app.route('/api/auth', auth)
app.route('/api/recipes', recipe)
app.route('/api/users', user)

// Serve images from R2
app.get('/images/:key', async (c) => {
  const key = c.req.param('key')
  const object = await c.env.groceree_r2.get(key)

  if (!object) {
    throw new ApiError(404, 'Image not found')
  }

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  
  return new Response(object.body, {
    headers,
  })
})

export default app