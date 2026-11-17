// Shared by the client and the Netlify Functions. Keep this file free of DOM and Node APIs.

export const MAX_REVIEW_CHARS = 600

/** A review as everyone sees it: first name only, never an email or an account id. */
export interface PublicReview {
  id: string
  name: string
  rating: number
  comment: string
  createdAt: string
}

export interface ReviewsResponse {
  reviews: PublicReview[]
  count: number
  /** Average rating to one decimal place, or null when nobody has reviewed yet. */
  average: number | null
}

/** The signed-in person's own review, so they can change it. */
export interface MyReview {
  rating: number
  comment: string
}
