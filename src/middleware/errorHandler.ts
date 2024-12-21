// Custom error class
export class ApiError extends Error {
    constructor(
      public statusCode: number,
      message: string,
      public originalError?: Error
    ) {
      super(message)
      this.name = 'ApiError'
    }
  }
  
  // Error handler middleware
  export const errorHandler = async (err: Error, c: any) => {
    console.error('Error:', err)
  
    if (err instanceof ApiError) {
      return c.json(
        { 
          error: err.message,
          ...(process.env.NODE_ENV === 'development' && err.originalError 
            ? { details: err.originalError.message } 
            : {})
        },
        err.statusCode
      )
    }
  
    // Handle Drizzle errors
    if (err.name === 'DrizzleError') {
      return c.json(
        { error: 'Database operation failed' },
        500
      )
    }
  
    // Handle validation errors
    if (err.name === 'ValidationError') {
      return c.json(
        { error: 'Invalid request data' },
        400
      )
    }
  
    // Default error response
    return c.json(
      { error: 'Internal server error' },
      500
    )
  }