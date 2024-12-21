interface Env {
    DB: D1Database
    groceree_r2: R2Bucket
  }

  interface Variables {
    user: {
      id: string;
      username: string;
    }
  }
  
  type Bindings = Env