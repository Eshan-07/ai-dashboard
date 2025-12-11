# AI Dashboard

A modern, AI-powered dashboard application featuring secure authentication, data visualization, and automated insights.

## Tech Stack

### Frontend
-   **Framework**: [React](https://react.dev/) (v19)
-   **Styling**: [Tailwind CSS](https://tailwindcss.com/)
-   **State Management**: [Zustand](https://zustand-demo.pmnd.rs/)
-   **Authentication**: [`@react-oauth/google`](https://www.npmjs.com/package/@react-oauth/google) for Google Sign-In
-   **Icons**: `lucide-react`, `react-icons`
-   **Charts**: `react-chartjs-2`, `recharts`, `react-plotly.js`
-   **HTTP Client**: `axios`

### Backend
-   **Framework**: [FastAPI](https://fastapi.tiangolo.com/) (Python)
-   **Database**: MongoDB (via `motor` async driver)
-   **Authentication**: 
    -   Google OAuth2 (`google-auth`)
    -   JWT / Session management
    -   **Password Hashing**: [Argon2](https://github.com/hynek/argon2-cffi) (via `passlib`) - Chosen for superior resistance to GPU cracking compared to Bcrypt.
-   **Email**: SMTP (via Python `smtplib`) for welcome emails.
-   **Server**: `uvicorn`

## Setup & Installation

### Prerequisites
-   Node.js & npm
-   Python 3.10+
-   MongoDB Instance (Atlas or Local)
-   Google Cloud Console Project (for OAuth Client ID)

### 1. Clone the Repository
```bash
git clone <repository_url>
cd ai-dashboard
```

### 2. Backend Setup
Navigate to the backend directory and install dependencies:
```bash
cd backend
# Create virtual environment (optional but recommended)
python -m venv venv
.\venv\Scripts\activate  # Windows

# Install requirements
pip install -r requirements.txt
```

**Environment Variables (`backend/.env`):**
Create a `.env` file in `backend/` with:
```env
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB=ai_dashboard
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
FRONTEND_URLS=*
```

**Run the Backend:**
```bash
# Start server on 0.0.0.0 (accessible on network)
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```
*The API will be available at `http://localhost:8000`.*

### 3. Frontend Setup
Navigate to the root directory and install dependencies:
```bash
cd ..
npm install
```

**Environment Variables (`.env`):**
Create a `.env` file in the root with:
```env
REACT_APP_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
REACT_APP_API_URL=http://localhost:8000
```

**Run the Frontend:**
```bash
npm start
```
*The app will open at `http://localhost:3000`.*

## Features & Functionality

### Authentication
-   **Google Sign-In**: Users can log in instantly with their Google account.
-   **Email/Password**: Traditional signup/login flow with secure **Argon2** password hashing.
-   **Welcome Email**: New users receive an automated welcome email upon registration (via background tasks).

### User Reset (Debugging)
If you need to clear all users to test the "New User" flow again:
1.  Open terminal in `backend/`.
2.  Run:
    ```bash
    python reset_users.py
    ```
3.  This permanently deletes all users from the MongoDB database.

## Algorithms
-   **Password Hashing**: Uses **Argon2id** (via `argon2-cffi`). This is a memory-hard function resistant to GPU-based attacks, providing higher security than standard SHA-256 or Bcrypt.
-   **Email Async Processing**: Uses FastAPI `BackgroundTasks` to send emails non-blocking, ensuring the user interface remains responsive during signup.
