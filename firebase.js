import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyCooY-akdKUXbVLhbWL7O0JuJC6j7cx2_Q",
  authDomain: "gmsh-care.firebaseapp.com",
  databaseURL: "https://gmsh-care-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "gmsh-care",
  storageBucket: "gmsh-care.firebasestorage.app",
  messagingSenderId: "793001226465",
  appId: "1:793001226465:web:bd80f4a5e1b93109a807a0"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
