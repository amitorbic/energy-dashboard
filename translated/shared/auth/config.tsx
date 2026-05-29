// Translated from: C:\Users\Amit\Desktop\Portal\php_project_1\shared\db_info.php
// Translation date: 2026-03-31 13:46
// Module: auth | Type: util
// ⚠️ VERIFY: How to handle JWT token and maintain user authentication state across different parts of the application. | Proper handling of sensitive information like usernames, passwords in production.

import { useAuth } from '../hooks/useAuth';

export const dbConfig = {
  username: "root",
  password: "",
  database: "markers"
};

export async function connectToDB() {
  // ⚠️ UNCERTAIN: How to handle JWT token and maintain user authentication state across different parts of the application.
  try {
    const response = await fetch('/api/db_connect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${useAuth().token}`
      },
      body: JSON.stringify(dbConfig)
    });
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }
    return await response.json();
  } catch (error) {
    console.error('Error connecting to the database:', error);
    throw error;
  }
}
//