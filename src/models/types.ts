// Enums
export enum MeasurementUnit {
    Grams = "g",
    Kilograms = "kg",
    Milliliters = "ml",
    Liters = "l",
    Pieces = "pcs",
    Tablespoons = "tbsp",
    Teaspoons = "tsp",
    Cups = "cup"
  }
  
  // Request Types
  export interface RegisterUserRequest {
    firstName: string
    lastName: string
    username: string
    password: string
  }
  
  export interface LoginRequest {
    username: string
    password: string
  }
  
  export interface CreateRecipeRequest {
    name: string
    duration: number
    servings: number
    ingredients: {
      name: string
      amount: number
      unit: MeasurementUnit
    }[]
    instructions: {
      step: number
      instruction: string
    }[]
  }
  
  // Response Types
  export interface Author {
    id: string
    firstName: string
  }
  
  export interface User {
    id: string
    firstName: string
    lastName: string
    imageUrl: string
    bio: string
  }
  
  export interface Ingredient {
    id: string
    name: string
    amount: number
    unit: MeasurementUnit
  }
  
  export interface Instruction {
    id: string
    step: number
    instruction: string
  }
  
  export interface RecipeListItem {
    id: string
    name: string
    imageUrl: string
    duration: number
    isFavorite: boolean
  }
  
  export interface Recipe {
    id: string
    author: Author
    name: string
    imageUrl: string
    duration: number
    servings: number
    ingredients: Ingredient[]
    instructions: Instruction[]
    isFavorite: boolean
  }
  
  // Auth Types
  export interface AuthUser {
    id: string
    username: string
  }