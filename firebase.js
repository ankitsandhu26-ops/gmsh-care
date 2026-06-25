// ─────────────────────────────────────────────────────────────────
//  STEP 1: Replace the values below with YOUR Firebase project keys.
//  See SETUP_GUIDE.md for instructions on where to find these.
// ─────────────────────────────────────────────────────────────────

import { initializeApp } from 'firebase/app'
import { getDatabase } from 'firebase/database'

const firebaseConfig = {
  apiKey:            "PASTE_YOUR_API_KEY_HERE",
  authDomain:        "PASTE_YOUR_AUTH_DOMAIN_HERE",
  databaseURL:       "PASTE_YOUR_DATABASE_URL_HERE",
  projectId:         "PASTE_YOUR_PROJECT_ID_HERE",
  storageBucket:     "PASTE_YOUR_STORAGE_BUCKET_HERE",
  messagingSenderId: "PASTE_YOUR_SENDER_ID_HERE",
  appId:             "PASTE_YOUR_APP_ID_HERE",
}

const app = initializeApp(firebaseConfig)
export const db = getDatabase(app)
